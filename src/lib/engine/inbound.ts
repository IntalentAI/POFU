import { db } from "../db";
import { parseDateOnly } from "../dates";
import { logEvent } from "../events";
import { emitWebhook } from "../webhooks";
import { interpretMessage } from "../ai";
import type { ConcernCategory } from "../constants";
import type { OutboundChannel } from "../channels";
import { cancelSchedule } from "./schedule";
import { raiseConcern, setCandidateStatus } from "./actions";
import { deliverToCandidate } from "./outbound";
import { evaluateReadiness } from "./readiness";

/**
 * Handle a message from a candidate on any channel: record it, understand it,
 * act on it (confirmations, concerns, alerts), and reply. This is the core of the
 * "understand responses and take action" differentiator (spec §2C).
 */
export async function handleInboundMessage(candidateId: string, body: string, channel: OutboundChannel, externalId?: string) {
  const candidate = await db.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { org: { include: { knowledge: true } }, recruiter: true, checklist: { orderBy: { position: "asc" } } },
  });
  const org = candidate.org;
  const now = new Date();

  if (externalId && (await db.message.findFirst({ where: { candidateId, externalId } }))) return null; // provider retry

  const history = await db.message.findMany({ where: { candidateId }, orderBy: { createdAt: "desc" }, take: 12 });
  const lastPrompt = await db.scheduledMessage.findFirst({ where: { candidateId, status: "sent" }, orderBy: { sentAt: "desc" } });

  const inbound = await db.message.create({
    data: { candidateId, direction: "inbound", channel, author: "candidate", authorName: candidate.firstName, body, delivery: "received", externalId },
  });
  await db.candidate.update({ where: { id: candidateId }, data: { lastInboundAt: now } });

  const result = await interpretMessage(body, {
    company: org.name, companion: org.companionName,
    candidate: { ...candidate, recruiterName: candidate.recruiter?.name ?? null },
    knowledge: org.knowledge,
    language: candidate.language,
    details: {
      firstDayTime: candidate.firstDayTime || org.firstDayTime,
      firstDayAddress: candidate.firstDayAddress || org.firstDayAddress || candidate.location,
      firstDayNotes: candidate.firstDayNotes || org.firstDayNotes,
    },
    checklist: candidate.checklist,
    history: history.reverse(),
    // Quick replies only make sense shortly after the prompt that offered them.
    lastPromptKind: lastPrompt?.sentAt && now.getTime() - lastPrompt.sentAt.getTime() < 14 * 86400_000 ? lastPrompt.kind : null,
    now,
  });
  const { engine, ...analysis } = result;
  await db.message.update({ where: { id: inbound.id }, data: { analysis: JSON.stringify({ ...analysis, engine }) } });

  if (candidate.status === "pre_joining") {
    if (analysis.confirmsJoiningDate || analysis.intent === "confirm") {
      await db.candidate.update({ where: { id: candidateId }, data: { lastConfirmedAt: now } });
      await logEvent(candidateId, "confirmed", "Confirmed joining plans", "candidate");
      await emitWebhook(org.id, "candidate.confirmed", { candidateId, externalId: candidate.externalId, joiningDate: candidate.joiningDate });
    }
    for (const concern of analysis.concerns) {
      const requested = concern.category === "joining_date_change" && analysis.requestedJoiningDate ? parseDateOnly(analysis.requestedJoiningDate) : null;
      await raiseConcern(candidate, concern.category as ConcernCategory, concern.summary, { sourceMessageId: inbound.id, requestedDate: requested });
    }
    if (analysis.intent === "arrived") {
      await setCandidateStatus(candidate, "joined", { actor: "candidate", reason: "Confirmed arrival on Day 1" });
    }
  }
  if (analysis.intent === "opt_out") {
    await db.candidate.update({ where: { id: candidateId }, data: { optedOut: true } });
    await cancelSchedule(candidateId, "Candidate opted out");
    await logEvent(candidateId, "opted_out", "Opted out of automated messages", "candidate");
  }

  const fresh = await db.candidate.findUniqueOrThrow({ where: { id: candidateId } });
  const { message: reply } = await deliverToCandidate({ candidate: fresh, org, body: analysis.reply, author: "ai", channel });
  await evaluateReadiness(candidateId);
  return { inbound, reply, analysis, engine };
}
