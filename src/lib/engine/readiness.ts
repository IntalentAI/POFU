import { db } from "../db";
import { daysBetween, fmtDate } from "../dates";
import { logEvent } from "../events";
import { emitWebhook } from "../webhooks";
import type { Readiness } from "../constants";

export type Reason = { tone: "positive" | "info" | "warning" | "danger"; text: string };

/**
 * Explainable, rules-based joining readiness (spec §3). Every status comes with the
 * indicators that produced it; no opaque score. A lack of response alone only raises
 * "needs attention", never "intervention required".
 */
export async function evaluateReadiness(candidateId: string, now = new Date()) {
  const c = await db.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: {
      concerns: { where: { status: "open" }, orderBy: { createdAt: "desc" } },
      scheduled: { where: { status: "sent", kind: { in: ["pulse", "message"] }, stepKey: { not: "welcome" } }, orderBy: { sentAt: "desc" }, take: 3 },
    },
  });
  if (c.status !== "pre_joining") return c;

  const reasons: Reason[] = [];
  let level: Readiness = "on_track";
  const raise = (l: Readiness) => {
    const order: Readiness[] = ["on_track", "needs_attention", "intervention_required"];
    if (order.indexOf(l) > order.indexOf(level)) level = l;
  };
  const daysToJoin = daysBetween(now, c.joiningDate);

  for (const concern of c.concerns) {
    reasons.push({ tone: concern.severity === "high" ? "danger" : "warning", text: concern.summary });
    raise(concern.severity === "high" ? "intervention_required" : "needs_attention");
  }

  if (c.lastConfirmedAt) {
    const ago = daysBetween(c.lastConfirmedAt, now);
    reasons.push({ tone: "positive", text: `Confirmed joining plans ${ago === 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`}` });
  } else if (daysToJoin <= 10) {
    reasons.push({ tone: "warning", text: "Joining date not yet confirmed" });
    raise("needs_attention");
  }

  // Communication: unanswered check-ins (follow-up needed, not a dropout signal on its own).
  const lastInbound = c.lastInboundAt?.getTime() ?? 0;
  const unanswered = c.scheduled.filter((s) => s.sentAt && s.sentAt.getTime() > lastInbound && daysBetween(s.sentAt, now) >= 2);
  if (unanswered.length >= 2) {
    reasons.push({ tone: "warning", text: `No reply to the last ${unanswered.length} check-ins` });
    raise("needs_attention");
  } else if (c.lastInboundAt) {
    reasons.push({ tone: "info", text: `Last replied ${fmtDate(c.lastInboundAt, { year: undefined })}` });
  }

  if (daysBetween(c.originalJoiningDate, c.joiningDate) !== 0) {
    reasons.push({ tone: "info", text: `Joining date moved from ${fmtDate(c.originalJoiningDate)} to ${fmtDate(c.joiningDate)}` });
  }
  if (c.optedOut) {
    reasons.push({ tone: "warning", text: "Candidate opted out of automated messages" });
    raise("needs_attention");
  }
  if (c.concerns.length === 0 && level === "on_track") {
    reasons.push({ tone: "positive", text: "No unresolved concerns" });
  }

  const changed = c.readiness !== level;
  const updated = await db.candidate.update({
    where: { id: c.id },
    data: { readiness: level, readinessReasons: JSON.stringify(reasons) },
  });
  if (changed) {
    await logEvent(c.id, "readiness_changed", `Readiness: ${c.readiness.replace(/_/g, " ")} → ${level.replace(/_/g, " ")}`);
    await emitWebhook(c.orgId, "candidate.readiness_changed", { candidateId: c.id, externalId: c.externalId, from: c.readiness, to: level, reasons });
  }
  return updated;
}

export function parseReasons(json: string): Reason[] {
  try { return JSON.parse(json) as Reason[]; } catch { return []; }
}
