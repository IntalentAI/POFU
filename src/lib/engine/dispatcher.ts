import { db } from "../db";
import { outstandingItems, outstandingList } from "../checklist";
import { localize } from "../ai";
import { daysBetween, isQuietHour } from "../dates";
import { logEvent } from "../events";
import { PULSE_OPTIONS } from "./default-campaign";
import { deliverToCandidate } from "./outbound";
import { evaluateReadiness } from "./readiness";
import { render, templateVars } from "./template";
import { startVoiceCall } from "./voice";
import { requestWelcome } from "./welcome";

/**
 * Process every scheduled engagement that is due. Safe to call repeatedly (cron,
 * internal interval, or the "Run scheduler" button).
 */
export async function runDueEngagements(now = new Date(), { sweepReadiness = false } = {}) {
  const due = await db.scheduledMessage.findMany({
    where: { status: "scheduled", scheduledFor: { lte: now } },
    include: { step: true, candidate: { include: { org: true } } },
    orderBy: { scheduledFor: "asc" },
    take: 200,
  });
  const summary = { processed: 0, sent: 0, skipped: 0, deferred: 0, failed: 0 };

  for (const item of due) {
    const { candidate, step } = item;
    const org = candidate.org;
    const skip = async (reason: string, status = "skipped") => {
      await db.scheduledMessage.update({ where: { id: item.id }, data: { status, statusReason: reason } });
      summary.skipped++;
    };
    summary.processed++;

    if (!step) { await skip("Step was removed from the campaign", "cancelled"); continue; }
    if (candidate.status !== "pre_joining") { await skip(`Candidate status is ${candidate.status}`, "cancelled"); continue; }
    if (candidate.optedOut) { await skip("Candidate opted out", "cancelled"); continue; }
    if (candidate.engagementPaused) { await skip("Engagement paused by recruiter"); continue; }
    if (isQuietHour(now, org.timezone, org.quietHoursStart, org.quietHoursEnd)) { summary.deferred++; continue; }

    // Personalise frequency, not just content: candidates who are clearly on track
    // get fewer optional touchpoints, and we don't re-ask someone who just confirmed.
    const confirmedRecently = candidate.lastConfirmedAt && daysBetween(candidate.lastConfirmedAt, now) <= 7;
    if (step.optional && candidate.readiness === "on_track" && confirmedRecently) {
      await skip("Reduced frequency — candidate recently confirmed and on track"); continue;
    }
    if (step.kind === "pulse" && candidate.lastConfirmedAt && daysBetween(candidate.lastConfirmedAt, now) <= 4) {
      await skip("Candidate confirmed joining plans in the last few days"); continue;
    }

    // Voice check-ins place a call instead of sending a message.
    if (step.kind === "voice") {
      const call = await startVoiceCall(candidate.id, "journey");
      if (!call.ok) { await skip(call.reason); continue; }
      await db.scheduledMessage.update({ where: { id: item.id }, data: { status: "sent", sentAt: now, statusReason: call.reason } });
      summary.sent++;
      continue;
    }

    // Only deliver a hiring-manager welcome that was actually recorded or written.
    let welcomeId: string | null = null;
    if (step.kind === "welcome") {
      const welcome = await db.welcomeMessage.findFirst({ where: { candidateId: candidate.id, status: "received" }, orderBy: { receivedAt: "asc" } });
      if (!welcome) { await skip("No welcome message recorded yet"); continue; }
      welcomeId = welcome.id;
    }

    const vars = templateVars({ candidate, org, now });
    let body = render(step.body, vars);
    if (step.kind === "pulse") body += "\n\n" + PULSE_OPTIONS.join("\n");

    // Documentation touchpoints list exactly what is still needed; reminders are skipped when nothing is.
    if (step.kind === "docs" || step.key === "documentation") {
      const list = outstandingList(await outstandingItems(candidate.id));
      if (!list && step.kind === "docs") { await skip("Nothing outstanding — all required items submitted"); continue; }
      if (list) body += "\n\n" + list;
    }
    let subject = step.subject ? render(step.subject, vars) : null;
    if (candidate.language && candidate.language !== "en") {
      body = await localize(body, candidate.language);
      if (subject) subject = await localize(subject, candidate.language);
    }

    const { message, result } = await deliverToCandidate({ candidate, org, body, subject, author: "ai" });
    const failed = result.delivery === "failed";
    await db.scheduledMessage.update({
      where: { id: item.id },
      data: { status: failed ? "failed" : "sent", sentAt: now, messageId: message.id, statusReason: result.error },
    });
    if (welcomeId && !failed) {
      await db.welcomeMessage.update({ where: { id: welcomeId }, data: { status: "delivered", deliveredAt: now } });
    }
    await logEvent(candidate.id, "engagement_sent", `${step.name}${failed ? ` (failed: ${result.error})` : ""}`, "ai");
    summary[failed ? "failed" : "sent"]++;
  }

  // Time-based signals (unconfirmed close to joining, unanswered check-ins) change
  // without any new message, so periodically re-evaluate everyone still pre-joining.
  const touched = new Set(due.map((d) => d.candidateId));
  const ids = sweepReadiness
    ? (await db.candidate.findMany({ where: { status: "pre_joining" }, select: { id: true } })).map((c) => c.id)
    : [...touched];
  for (const id of ids) await evaluateReadiness(id, now);
  if (sweepReadiness) await remindHiringManagers(now);
  return summary;
}

/** One reminder for hiring managers who haven't recorded a welcome after 4 days (if the start is still > 3 days away). */
async function remindHiringManagers(now: Date) {
  const stale = await db.welcomeMessage.findMany({
    where: {
      status: "requested", remindedAt: null, requestedAt: { lte: new Date(now.getTime() - 4 * 86400_000) },
      candidate: { status: "pre_joining", joiningDate: { gte: new Date(now.getTime() + 3 * 86400_000) } },
    },
    include: { candidate: { include: { org: true } } },
    take: 50,
  });
  for (const w of stale) await requestWelcome(w.candidate, w.candidate.org, { actor: "ai", reminder: true });
}
