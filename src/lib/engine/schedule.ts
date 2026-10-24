import type { CampaignStep, Candidate, Organization } from "@prisma/client";
import { db } from "../db";
import { addDays, atLocalHour, daysBetween, startOfDayUTC } from "../dates";

const MIN_GAP_DAYS = 2;

type Planned = { step: CampaignStep; day: Date };

/** Calendar day a step falls on for this candidate, or null if it doesn't apply. */
export function stepDay(step: CampaignStep, accepted: Date, joining: Date): Date | null {
  const a = startOfDayUTC(accepted), j = startOfDayUTC(joining);
  const notice = daysBetween(a, j);
  switch (step.anchor) {
    case "after_acceptance": return addDays(a, step.offset);
    case "before_joining": return addDays(j, -step.offset);
    case "notice_percent":
      // Mid-notice touchpoints only make sense with a real notice period.
      if (notice < 21) return null;
      return addDays(a, Math.round((notice * step.offset) / 100));
    default: return null;
  }
}

const priority = (s: CampaignStep) => (s.optional ? 0 : 2) + (s.kind !== "message" ? 1 : 0);
// The welcome and the final days before joining always go out, however close together.
const isFinalStretch = (s: CampaignStep) => s.anchor === "before_joining" && s.offset <= 1;
const isEssential = (s: CampaignStep) => s.key === "welcome" || isFinalStretch(s);

/**
 * Plan which steps a candidate should receive and when. Adapts to the length of the
 * notice period: steps after the joining date are dropped, and when touchpoints land
 * too close together the lower-priority ones are dropped so short notice periods
 * don't get a burst of messages.
 */
export function planSchedule(steps: CampaignStep[], c: Pick<Candidate, "offerAcceptedAt" | "joiningDate">, now: Date, excludeKeys = new Set<string>()) {
  const today = startOfDayUTC(now);
  const joining = startOfDayUTC(c.joiningDate);
  const candidates: Planned[] = [];
  for (const step of steps) {
    if (excludeKeys.has(step.key)) continue;
    const day = stepDay(step, c.offerAcceptedAt, c.joiningDate);
    if (!day || day > joining) continue;
    if (day < today && step.key !== "welcome") continue;
    // A pre-joining step can't land before acceptance (very short notice periods).
    if (day < startOfDayUTC(c.offerAcceptedAt)) continue;
    candidates.push({ step, day: day < today ? today : day });
  }
  const kept: Planned[] = candidates.filter((p) => isEssential(p.step));
  for (const p of [...candidates].sort((x, y) => priority(y.step) - priority(x.step) || x.day.getTime() - y.day.getTime())) {
    if (isEssential(p.step)) continue;
    const clash = kept.some((k) => Math.abs(daysBetween(k.day, p.day)) < MIN_GAP_DAYS);
    if (!clash) kept.push(p);
  }
  return kept.sort((x, y) => x.day.getTime() - y.day.getTime());
}

/** (Re)build the pending engagement schedule for a candidate. Already-sent steps are never repeated. */
export async function rebuildSchedule(candidate: Candidate, org: Organization, now = new Date()) {
  await db.scheduledMessage.updateMany({
    where: { candidateId: candidate.id, status: "scheduled" },
    data: { status: "cancelled", statusReason: "Schedule rebuilt" },
  });
  if (candidate.status !== "pre_joining" || candidate.optedOut || !candidate.campaignId) return [];

  const steps = await db.campaignStep.findMany({ where: { campaignId: candidate.campaignId }, orderBy: { position: "asc" } });
  const done = await db.scheduledMessage.findMany({
    where: { candidateId: candidate.id, status: { in: ["sent", "skipped"] } },
    select: { stepKey: true },
  });
  // Pulse/confirmation steps should run again after a joining-date change.
  const exclude = new Set(done.map((d) => d.stepKey).filter((k) => {
    const s = steps.find((st) => st.key === k);
    return !s || s.kind === "message" || s.anchor !== "before_joining";
  }));
  const plan = planSchedule(steps, candidate, now, exclude);
  const rows = plan.map(({ step, day }) => {
    let at = atLocalHour(day, org.sendHour, org.timezone);
    if (step.key === "welcome" || at < now) at = now; // send at the next scheduler tick
    return { candidateId: candidate.id, stepId: step.id, stepKey: step.key, kind: step.kind, scheduledFor: at };
  });
  if (rows.length) await db.scheduledMessage.createMany({ data: rows });
  return rows;
}

export async function cancelSchedule(candidateId: string, reason: string) {
  await db.scheduledMessage.updateMany({
    where: { candidateId, status: "scheduled" },
    data: { status: "cancelled", statusReason: reason },
  });
}
