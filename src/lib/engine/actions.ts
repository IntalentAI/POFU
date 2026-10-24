// Domain operations shared by the recruiter UI, the integration API and the AI agent.
import type { Candidate, Organization } from "@prisma/client";
import { db } from "../db";
import { CONCERN_CATEGORIES, type ConcernCategory } from "../constants";
import { daysBetween, fmtDate } from "../dates";
import { logEvent } from "../events";
import { emitWebhook } from "../webhooks";
import { deliverToCandidate } from "./outbound";
import { evaluateReadiness } from "./readiness";
import { cancelSchedule, rebuildSchedule } from "./schedule";

export type EnrollInput = {
  firstName: string; lastName?: string; email?: string | null; phone?: string | null;
  preferredChannel?: string; language?: string; position: string; department?: string | null;
  location?: string | null; hiringManagerName?: string | null; hiringManagerEmail?: string | null;
  recruiterId?: string | null; campaignId?: string | null; externalId?: string | null;
  source?: string; offerAcceptedAt?: Date; joiningDate: Date;
};

/** Enroll a candidate whose offer was accepted: create, build their journey, send the welcome. */
export async function enrollCandidate(org: Organization, input: EnrollInput, actor = "system") {
  const campaignId = input.campaignId
    ?? (await db.campaign.findFirst({ where: { orgId: org.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }))?.id
    ?? null;
  const candidate = await db.candidate.create({
    data: {
      orgId: org.id, externalId: input.externalId || null, source: input.source ?? "manual",
      firstName: input.firstName, lastName: input.lastName ?? "", email: input.email || null, phone: input.phone || null,
      preferredChannel: input.preferredChannel ?? org.defaultChannel, language: input.language ?? "en",
      position: input.position, department: input.department || null, location: input.location || null,
      hiringManagerName: input.hiringManagerName || null, hiringManagerEmail: input.hiringManagerEmail || null,
      recruiterId: input.recruiterId || null, campaignId,
      offerAcceptedAt: input.offerAcceptedAt ?? new Date(),
      joiningDate: input.joiningDate, originalJoiningDate: input.joiningDate,
    },
  });
  await logEvent(candidate.id, "enrolled", `Offer accepted — enrolled via ${candidate.source}. Joining ${fmtDate(candidate.joiningDate)}.`, actor);
  const plan = await rebuildSchedule(candidate, org);
  await evaluateReadiness(candidate.id);
  await emitWebhook(org.id, "candidate.enrolled", { candidateId: candidate.id, externalId: candidate.externalId, joiningDate: candidate.joiningDate, scheduledEngagements: plan.length });
  return candidate;
}

export async function changeJoiningDate(candidate: Candidate, org: Organization, newDate: Date, opts: { actor: string; notify: boolean; reason?: string }) {
  const old = candidate.joiningDate;
  if (daysBetween(old, newDate) === 0) return candidate;
  const updated = await db.candidate.update({ where: { id: candidate.id }, data: { joiningDate: newDate } });
  await logEvent(candidate.id, "joining_date_changed", `Joining date changed from ${fmtDate(old)} to ${fmtDate(newDate)}${opts.reason ? ` — ${opts.reason}` : ""}`, opts.actor);
  await rebuildSchedule(updated, org);
  if (opts.notify) {
    await deliverToCandidate({
      candidate: updated, org, author: "ai", subject: "Your joining date is confirmed",
      body: `Hi ${updated.firstName}, good news — your joining date is now confirmed as ${fmtDate(newDate, { weekday: "long", month: "long", day: "numeric", year: undefined })}. Let me know if you have any questions.`,
    });
  }
  await emitWebhook(org.id, "candidate.joining_date_changed", { candidateId: candidate.id, externalId: candidate.externalId, from: old, to: newDate });
  await evaluateReadiness(candidate.id);
  return updated;
}

export async function raiseConcern(candidate: Candidate, category: ConcernCategory, summary: string, opts: { sourceMessageId?: string; requestedDate?: Date | null; actor?: string } = {}) {
  const meta = CONCERN_CATEGORIES[category] ?? CONCERN_CATEGORIES.other;
  const existing = await db.concern.findFirst({ where: { candidateId: candidate.id, category, status: "open" } });
  if (existing) {
    // Same open issue: refresh it rather than stacking duplicate alerts.
    return db.concern.update({
      where: { id: existing.id },
      data: { summary, requestedDate: opts.requestedDate ?? existing.requestedDate, sourceMessageId: opts.sourceMessageId ?? existing.sourceMessageId },
    });
  }
  const concern = await db.concern.create({
    data: {
      orgId: candidate.orgId, candidateId: candidate.id, category, severity: meta.severity, summary,
      suggestedAction: meta.action, owner: meta.owner, requestedDate: opts.requestedDate ?? null,
      assigneeId: candidate.recruiterId, sourceMessageId: opts.sourceMessageId,
    },
  });
  await logEvent(candidate.id, "concern_raised", `${meta.label}: ${summary}`, opts.actor ?? "ai");
  await emitWebhook(candidate.orgId, "concern.raised", { concernId: concern.id, candidateId: candidate.id, externalId: candidate.externalId, category, severity: concern.severity, summary });
  return concern;
}

export async function resolveConcern(concernId: string, resolution: string, actor: string) {
  const concern = await db.concern.update({
    where: { id: concernId },
    data: { status: "resolved", resolution, resolvedAt: new Date() },
    include: { candidate: true },
  });
  await logEvent(concern.candidateId, "concern_resolved", `${CONCERN_CATEGORIES[concern.category as ConcernCategory]?.label ?? concern.category} resolved${resolution ? `: ${resolution}` : ""}`, actor);
  await emitWebhook(concern.orgId, "concern.resolved", { concernId, candidateId: concern.candidateId, externalId: concern.candidate.externalId, resolution });
  await evaluateReadiness(concern.candidateId);
  return concern;
}

export async function setCandidateStatus(candidate: Candidate, status: "joined" | "dropped" | "offer_rescinded" | "pre_joining", opts: { actor: string; reason?: string }) {
  const data: Partial<Candidate> = { status };
  if (status === "joined") data.joinedAt = new Date();
  if (status === "dropped") data.dropoutReason = opts.reason ?? "Other";
  const updated = await db.candidate.update({ where: { id: candidate.id }, data });
  if (status === "pre_joining") {
    const org = await db.organization.findUniqueOrThrow({ where: { id: candidate.orgId } });
    await rebuildSchedule(updated, org);
  } else {
    // Stop all engagement immediately so no inappropriate messages go out.
    await cancelSchedule(candidate.id, `Candidate marked ${status}`);
    await db.concern.updateMany({
      where: { candidateId: candidate.id, status: "open" },
      data: { status: "resolved", resolution: `Closed — candidate marked ${status}`, resolvedAt: new Date() },
    });
  }
  const label = { joined: "Joined", dropped: "Did not join", offer_rescinded: "Offer rescinded", pre_joining: "Reopened" }[status];
  await logEvent(candidate.id, "status_changed", `${label}${opts.reason ? ` — ${opts.reason}` : ""}`, opts.actor);
  await emitWebhook(candidate.orgId, "candidate.status_changed", { candidateId: candidate.id, externalId: candidate.externalId, status, reason: opts.reason });
  if (status === "pre_joining") await evaluateReadiness(candidate.id);
  return updated;
}

export async function setEngagementPaused(candidate: Candidate, paused: boolean, actor: string) {
  await db.candidate.update({ where: { id: candidate.id }, data: { engagementPaused: paused } });
  await logEvent(candidate.id, "engagement", paused ? "Automated engagement paused" : "Automated engagement resumed", actor);
}
