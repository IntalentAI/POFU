import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { addDays, daysBetween, fmtDate, fmtDateTime, startOfDayUTC } from "@/lib/dates";
import { parseReasons } from "@/lib/engine/readiness";
import { recommendAction } from "@/lib/recommend";
import { Avatar, Empty, PageHeader, ReadinessBadge, ReadinessDot, ReasonList, StatCard } from "@/components/ui";

const SEVERITY_ORDER: Record<string, number> = { intervention_required: 0, needs_attention: 1, on_track: 2 };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const { welcome } = await searchParams;
  const now = new Date();
  const today = startOfDayUTC(now);
  const [stats, attention, thisWeek, activity, total] = await Promise.all([
    getAnalytics(user.orgId),
    db.candidate.findMany({
      where: { orgId: user.orgId, status: "pre_joining", readiness: { not: "on_track" } },
      include: { concerns: { where: { status: "open" } }, recruiter: true },
    }),
    db.candidate.findMany({
      where: { orgId: user.orgId, status: "pre_joining", joiningDate: { gte: today, lt: addDays(today, 7) } },
      orderBy: { joiningDate: "asc" },
    }),
    db.event.findMany({
      where: { candidate: { orgId: user.orgId }, type: { in: ["confirmed", "concern_raised", "concern_resolved", "joining_date_changed", "status_changed", "enrolled", "opted_out"] } },
      include: { candidate: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" }, take: 12,
    }),
    db.candidate.count({ where: { orgId: user.orgId } }),
  ]);
  attention.sort((a, b) => SEVERITY_ORDER[a.readiness] - SEVERITY_ORDER[b.readiness] || a.joiningDate.getTime() - b.joiningDate.getTime());

  return (
    <div>
      <PageHeader
        title="Offer-to-Join Command Center"
        subtitle={`${fmtDate(now, { weekday: "long", month: "long", day: "numeric" })} · Who is joining, who has confirmed, and who needs you.`}
        actions={<Link href="/candidates/new" className="btn-primary">+ Add accepted offer</Link>}
      />

      {(welcome || total === 0) && (
        <div className="card mb-6 border-brand-200 bg-brand-50 p-5">
          <h2 className="h2">Welcome to Joining Assurance 👋</h2>
          <p className="mt-1 text-sm text-zinc-700">Get started in three steps:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
            <li><Link className="text-brand-700 underline" href="/candidates/new">Add an accepted offer</Link> or <Link className="text-brand-700 underline" href="/candidates/import">import a CSV</Link> — your AI companion sends the welcome immediately.</li>
            <li>Review your <Link className="text-brand-700 underline" href="/campaigns">engagement journey</Link> and the <Link className="text-brand-700 underline" href="/settings#knowledge">approved answers</Link> the companion may use.</li>
            <li>Connect your ATS with the <Link className="text-brand-700 underline" href="/settings#api">API & webhooks</Link> so candidates are enrolled automatically on offer acceptance.</li>
          </ol>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Expected joiners" value={stats.expectedJoiners} hint={`${stats.confirmed} confirmed`} href="/candidates" />
        <StatCard label="Joining in next 7 days" value={thisWeek.length} href="/calendar" />
        <StatCard label="Intervention required" value={stats.readiness.intervention_required} tone={stats.readiness.intervention_required ? "danger" : undefined} href="/candidates?readiness=intervention_required" />
        <StatCard label="Needs attention" value={stats.readiness.needs_attention} tone={stats.readiness.needs_attention ? "warning" : undefined} href="/candidates?readiness=needs_attention" />
        <StatCard label="Joining conversion" value={stats.conversion === null ? "—" : `${stats.conversion}%`} hint={`${stats.joined} joined · ${stats.dropped} did not`} href="/analytics" tone="good" />
        <StatCard label="Open concerns" value={stats.openConcerns} hint={stats.avgResolutionHours !== null ? `avg ${stats.avgResolutionHours}h to resolve` : undefined} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card xl:col-span-2">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
            <h2 className="h2">Attention required <span className="ml-1 text-zinc-400">{attention.length}</span></h2>
            <span className="text-xs text-zinc-500">Sorted by urgency, then joining date</span>
          </div>
          {attention.length === 0 ? <Empty>Everyone is on track. 🎉</Empty> : (
            <ul className="divide-y divide-zinc-100">
              {attention.map((c) => {
                const reasons = parseReasons(c.readinessReasons).filter((r) => r.tone !== "info");
                const rec = recommendAction(c.concerns, reasons);
                const days = daysBetween(now, c.joiningDate);
                return (
                  <li key={c.id}>
                    <Link href={`/candidates/${c.id}`} className="block px-5 py-4 hover:bg-zinc-50">
                      <div className="flex flex-wrap items-start gap-3">
                        <Avatar name={`${c.firstName} ${c.lastName}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{c.firstName} {c.lastName}</span>
                            <ReadinessBadge readiness={c.readiness} />
                          </div>
                          <div className="text-xs text-zinc-500">
                            {c.position} · joins {fmtDate(c.joiningDate, { year: undefined })} ({days <= 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}) · {c.recruiter?.name ?? "Unassigned"}
                          </div>
                          <div className="mt-2"><ReasonList reasons={reasons} compact /></div>
                          {rec && (
                            <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
                              <span className="font-semibold">Suggested action:</span> {rec}
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="card">
            <div className="border-b border-zinc-100 px-5 py-3"><h2 className="h2">Joining in the next 7 days</h2></div>
            {thisWeek.length === 0 ? <Empty>No one is joining this week.</Empty> : (
              <ul className="divide-y divide-zinc-100">
                {thisWeek.map((c) => (
                  <li key={c.id}>
                    <Link href={`/candidates/${c.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-50">
                      <ReadinessDot readiness={c.readiness} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{c.firstName} {c.lastName}</div>
                        <div className="truncate text-xs text-zinc-500">{c.position}</div>
                      </div>
                      <div className="text-right text-xs text-zinc-600">{fmtDate(c.joiningDate, { weekday: "short", year: undefined })}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="border-b border-zinc-100 px-5 py-3"><h2 className="h2">Recent activity</h2></div>
            {activity.length === 0 ? <Empty>No activity yet.</Empty> : (
              <ul className="space-y-3 px-5 py-4">
                {activity.map((e) => (
                  <li key={e.id} className="text-sm">
                    <Link href={`/candidates/${e.candidate.id}`} className="font-medium hover:underline">{e.candidate.firstName} {e.candidate.lastName}</Link>
                    <span className="text-zinc-600"> — {e.detail}</span>
                    <div className="text-xs text-zinc-400">{fmtDateTime(e.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
