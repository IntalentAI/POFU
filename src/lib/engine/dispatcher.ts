import { db } from "../db";
import { daysBetween, isQuietHour } from "../dates";
import { logEvent } from "../events";
import { PULSE_OPTIONS } from "./default-campaign";
import { deliverToCandidate } from "./outbound";
import { evaluateReadiness } from "./readiness";
import { render, templateVars } from "./template";

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

    const vars = templateVars({ candidate, org, now });
    let body = render(step.body, vars);
    if (step.kind === "pulse") body += "\n\n" + PULSE_OPTIONS.join("\n");
    const subject = step.subject ? render(step.subject, vars) : null;

    const { message, result } = await deliverToCandidate({ candidate, org, body, subject, author: "ai" });
    const failed = result.delivery === "failed";
    await db.scheduledMessage.update({
      where: { id: item.id },
      data: { status: failed ? "failed" : "sent", sentAt: now, messageId: message.id, statusReason: result.error },
    });
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
  return summary;
}
