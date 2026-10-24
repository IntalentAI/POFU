import { requireUser } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";
import { fmtDate } from "@/lib/dates";
import { PageHeader, StatCard } from "@/components/ui";

const PERIODS = [30, 90, 180, 365];

function Bars({ rows, total, colors }: { rows: readonly (readonly [string, number])[]; total: number; colors?: string[] }) {
  if (!rows.length) return <p className="muted">No data yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map(([label, n], i) => (
        <li key={label}>
          <div className="mb-0.5 flex justify-between text-sm"><span>{label}</span><span className="tabular-nums text-zinc-500">{n} · {Math.round((n / total) * 100)}%</span></div>
          <div className="h-2 rounded-full bg-zinc-100"><div className={`h-2 rounded-full ${colors?.[i] ?? "bg-brand-500"}`} style={{ width: `${(n / total) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; accepted: number; joined: number; dropped: number; pending: number; conversion: number | null }[] }) {
  return (
    <section className="card overflow-x-auto">
      <div className="border-b border-zinc-100 px-5 py-3"><h2 className="h2">{title}</h2></div>
      <table className="w-full min-w-[420px] text-sm">
        <thead><tr className="border-b border-zinc-100">
          <th className="table-head"></th><th className="table-head text-right">Accepted</th><th className="table-head text-right">Joined</th>
          <th className="table-head text-right">Did not join</th><th className="table-head text-right">Pending</th><th className="table-head text-right">Conversion</th>
        </tr></thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="table-cell font-medium">{r.key}</td>
              <td className="table-cell text-right tabular-nums">{r.accepted}</td>
              <td className="table-cell text-right tabular-nums">{r.joined}</td>
              <td className="table-cell text-right tabular-nums">{r.dropped}</td>
              <td className="table-cell text-right tabular-nums">{r.pending}</td>
              <td className="table-cell text-right tabular-nums font-medium">{r.conversion === null ? "—" : `${r.conversion}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireUser();
  const days = PERIODS.includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 180;
  const a = await getAnalytics(user.orgId, days);
  const maxWeek = Math.max(1, ...a.upcomingWeeks.map((w) => w.total));
  const preTotal = a.readiness.on_track + a.readiness.needs_attention + a.readiness.intervention_required;

  return (
    <div>
      <PageHeader
        title="Joining analytics"
        subtitle={`Offers accepted in the last ${days} days. Conversion = joined ÷ (joined + did not join); rescinded offers are excluded.`}
        actions={<div className="flex gap-1">{PERIODS.map((p) => <a key={p} href={`?days=${p}`} className={p === days ? "btn-primary" : "btn-secondary"}>{p}d</a>)}</div>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Offers accepted" value={a.offersAccepted} />
        <StatCard label="Joining conversion rate" value={a.conversion === null ? "—" : `${a.conversion}%`} hint={`${a.joined} joined · ${a.dropped} did not join`} tone="good" />
        <StatCard label="Expected joiners" value={a.expectedJoiners} hint={`${a.confirmed} confirmed`} />
        <StatCard label="At-risk candidates" value={a.readiness.intervention_required + a.readiness.needs_attention} tone="warning" hint={`${a.readiness.intervention_required} need intervention`} />
        <StatCard label="Avg offer-to-join" value={a.avgOfferToJoin === null ? "—" : `${a.avgOfferToJoin} days`} />
        <StatCard label="Joining date changes" value={a.extensions} />
        <StatCard label="Candidate engagement" value={a.engagementRate === null ? "—" : `${a.engagementRate}%`} hint="replied at least once" />
        <StatCard label="Avg concern resolution" value={a.avgResolutionHours === null ? "—" : `${a.avgResolutionHours} h`} hint={`${a.openConcerns} open`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="h2 mb-4">Expected joiners — next 8 weeks</h2>
          <div className="flex h-44 items-end gap-3">
            {a.upcomingWeeks.map((w) => (
              <div key={w.from.toISOString()} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs tabular-nums text-zinc-600">{w.total || ""}</span>
                <div className="flex w-full flex-col-reverse overflow-hidden rounded-md" style={{ height: `${(w.total / maxWeek) * 130}px` }}>
                  <div className="bg-emerald-500" style={{ flex: w.on_track }} />
                  <div className="bg-amber-400" style={{ flex: w.needs_attention }} />
                  <div className="bg-red-500" style={{ flex: w.intervention_required }} />
                </div>
                <span className="text-[11px] text-zinc-500">{fmtDate(w.from, { year: undefined })}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="h2 mb-4">Joining confidence</h2>
          <Bars total={Math.max(1, preTotal)} colors={["bg-emerald-500", "bg-amber-400", "bg-red-500"]} rows={[["On track", a.readiness.on_track], ["Needs attention", a.readiness.needs_attention], ["Intervention required", a.readiness.intervention_required]]} />
        </section>
        <section className="card p-5">
          <h2 className="h2 mb-4">Dropout reasons</h2>
          <Bars total={Math.max(1, a.dropped)} rows={a.dropoutReasons} />
        </section>
        <section className="card p-5">
          <h2 className="h2 mb-4">Concerns raised</h2>
          <Bars total={Math.max(1, a.concernsByCategory.reduce((s, [, n]) => s + n, 0))} rows={a.concernsByCategory} />
        </section>
        <div className="lg:col-span-3 grid gap-6 lg:grid-cols-2">
          <Breakdown title="By recruiter" rows={a.byRecruiter} />
          <Breakdown title="By department" rows={a.byDepartment} />
          <Breakdown title="By location" rows={a.byLocation} />
          <Breakdown title="By source" rows={a.bySource} />
        </div>
      </div>
    </div>
  );
}
