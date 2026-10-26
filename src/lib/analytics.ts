import { db } from "./db";
import { addDays, daysBetween, startOfDayUTC } from "./dates";
import { CONCERN_CATEGORIES, type ConcernCategory } from "./constants";

type Row = { key: string; accepted: number; joined: number; dropped: number; pending: number; conversion: number | null };

export async function getAnalytics(orgId: string, sinceDays = 180, now = new Date()) {
  const since = addDays(now, -sinceDays);
  const candidates = await db.candidate.findMany({
    where: { orgId, offerAcceptedAt: { gte: since } },
    include: {
      recruiter: { select: { name: true } },
      _count: { select: { messages: { where: { direction: "inbound" } } } },
      checklist: { where: { required: true }, select: { status: true } },
      welcomes: { select: { status: true } },
      calls: { select: { status: true } },
    },
  });
  const concerns = await db.concern.findMany({ where: { orgId, createdAt: { gte: since } } });

  const joined = candidates.filter((c) => c.status === "joined");
  const dropped = candidates.filter((c) => c.status === "dropped");
  const pre = candidates.filter((c) => c.status === "pre_joining");
  const decided = joined.length + dropped.length;
  const conversion = decided ? Math.round((joined.length / decided) * 1000) / 10 : null;

  const avgOfferToJoin = joined.length
    ? Math.round(joined.reduce((s, c) => s + daysBetween(c.offerAcceptedAt, c.joiningDate), 0) / joined.length)
    : null;
  const extensions = candidates.filter((c) => daysBetween(c.originalJoiningDate, c.joiningDate) !== 0);
  const engaged = candidates.filter((c) => c._count.messages > 0).length;

  const dropoutReasons = Object.entries(
    dropped.reduce<Record<string, number>>((acc, c) => ((acc[c.dropoutReason ?? "Other"] = (acc[c.dropoutReason ?? "Other"] ?? 0) + 1), acc), {}),
  ).sort((a, b) => b[1] - a[1]);

  const concernsByCategory = Object.entries(
    concerns.reduce<Record<string, number>>((acc, c) => ((acc[c.category] = (acc[c.category] ?? 0) + 1), acc), {}),
  ).map(([k, n]) => [CONCERN_CATEGORIES[k as ConcernCategory]?.label ?? k, n] as const).sort((a, b) => b[1] - a[1]);

  const resolved = concerns.filter((c) => c.resolvedAt);
  const avgResolutionHours = resolved.length
    ? Math.round(resolved.reduce((s, c) => s + (c.resolvedAt!.getTime() - c.createdAt.getTime()), 0) / resolved.length / 3600_000)
    : null;

  const group = (keyOf: (c: (typeof candidates)[number]) => string): Row[] => {
    const map = new Map<string, Row>();
    for (const c of candidates) {
      const key = keyOf(c);
      const r = map.get(key) ?? { key, accepted: 0, joined: 0, dropped: 0, pending: 0, conversion: null };
      r.accepted++;
      if (c.status === "joined") r.joined++;
      else if (c.status === "dropped") r.dropped++;
      else if (c.status === "pre_joining") r.pending++;
      map.set(key, r);
    }
    return [...map.values()]
      .map((r) => ({ ...r, conversion: r.joined + r.dropped ? Math.round((r.joined / (r.joined + r.dropped)) * 100) : null }))
      .sort((a, b) => b.accepted - a.accepted);
  };

  // Expected joiners per week for the next 8 weeks.
  const weekStart = startOfDayUTC(now);
  const upcomingWeeks = Array.from({ length: 8 }, (_, i) => {
    const from = addDays(weekStart, i * 7), to = addDays(from, 7);
    const inWeek = pre.filter((c) => c.joiningDate >= from && c.joiningDate < to);
    return {
      from,
      total: inWeek.length,
      on_track: inWeek.filter((c) => c.readiness === "on_track").length,
      needs_attention: inWeek.filter((c) => c.readiness === "needs_attention").length,
      intervention_required: inWeek.filter((c) => c.readiness === "intervention_required").length,
    };
  });

  // Phase 2 signals: documentation readiness, hiring-manager engagement, voice check-ins.
  const withChecklist = pre.filter((c) => c.checklist.length);
  const docsReady = withChecklist.filter((c) => c.checklist.every((i) => i.status === "verified" || i.status === "waived")).length;
  const welcomeAsked = candidates.filter((c) => c.welcomes.length);
  const welcomeGiven = welcomeAsked.filter((c) => c.welcomes.some((w) => w.status !== "requested")).length;
  const calls = candidates.flatMap((c) => c.calls);
  const joinedWithWelcome = joined.filter((c) => c.welcomes.some((w) => w.status === "delivered")).length;
  const decidedWithWelcome = [...joined, ...dropped].filter((c) => c.welcomes.some((w) => w.status === "delivered")).length;

  return {
    sinceDays,
    docsReadiness: withChecklist.length ? Math.round((docsReady / withChecklist.length) * 100) : null,
    docsReadyCount: docsReady, docsTracked: withChecklist.length,
    welcomeRate: welcomeAsked.length ? Math.round((welcomeGiven / welcomeAsked.length) * 100) : null,
    welcomeConversion: decidedWithWelcome ? Math.round((joinedWithWelcome / decidedWithWelcome) * 100) : null,
    voiceCalls: calls.length, voiceAnswered: calls.filter((c) => c.status === "completed").length,
    offersAccepted: candidates.length,
    expectedJoiners: pre.length,
    joined: joined.length,
    dropped: dropped.length,
    rescinded: candidates.filter((c) => c.status === "offer_rescinded").length,
    conversion,
    readiness: {
      on_track: pre.filter((c) => c.readiness === "on_track").length,
      needs_attention: pre.filter((c) => c.readiness === "needs_attention").length,
      intervention_required: pre.filter((c) => c.readiness === "intervention_required").length,
    },
    confirmed: pre.filter((c) => c.lastConfirmedAt).length,
    avgOfferToJoin,
    extensions: extensions.length,
    engagementRate: candidates.length ? Math.round((engaged / candidates.length) * 100) : null,
    openConcerns: concerns.filter((c) => c.status === "open").length,
    avgResolutionHours,
    dropoutReasons,
    concernsByCategory,
    byRecruiter: group((c) => c.recruiter?.name ?? "Unassigned"),
    byDepartment: group((c) => c.department ?? "—"),
    byLocation: group((c) => c.location ?? "—"),
    bySource: group((c) => c.source),
    upcomingWeeks,
  };
}
