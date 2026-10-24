import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, startOfDayUTC } from "@/lib/dates";
import { PageHeader, ReadinessDot } from "@/components/ui";

const DOT_STATUS: Record<string, string> = { joined: "bg-brand-600", dropped: "bg-zinc-400", offer_rescinded: "bg-zinc-300" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { month } = await searchParams;
  const today = startOfDayUTC(new Date());
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  const first = m ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const prev = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1));
  const gridStart = addDays(first, -((first.getUTCDay() + 6) % 7)); // Monday
  const cells = Array.from({ length: Math.ceil(((next.getTime() - gridStart.getTime()) / 86400000) / 7) * 7 }, (_, i) => addDays(gridStart, i));

  const joiners = await db.candidate.findMany({
    where: { orgId: user.orgId, joiningDate: { gte: gridStart, lt: addDays(cells[cells.length - 1], 1) }, status: { not: "offer_rescinded" } },
    orderBy: { joiningDate: "asc" },
  });
  const byDay = new Map<string, typeof joiners>();
  for (const j of joiners) {
    const k = j.joiningDate.toISOString().slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), j]);
  }
  const inMonth = joiners.filter((j) => j.joiningDate >= first && j.joiningDate < next);
  const ym = (d: Date) => d.toISOString().slice(0, 7);
  const title = first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div>
      <PageHeader
        title="Joining calendar"
        subtitle={`${inMonth.length} expected joiner${inMonth.length === 1 ? "" : "s"} in ${title} · ${inMonth.filter((j) => j.status === "pre_joining" && j.readiness !== "on_track").length} need attention`}
        actions={<div className="flex items-center gap-2">
          <Link href={`/calendar?month=${ym(prev)}`} className="btn-secondary">←</Link>
          <span className="w-36 text-center text-sm font-medium">{title}</span>
          <Link href={`/calendar?month=${ym(next)}`} className="btn-secondary">→</Link>
          <Link href="/calendar" className="btn-ghost">Today</Link>
        </div>}
      />
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-zinc-600">
        <span className="flex items-center gap-1.5"><ReadinessDot readiness="on_track" /> On track</span>
        <span className="flex items-center gap-1.5"><ReadinessDot readiness="needs_attention" /> Needs attention</span>
        <span className="flex items-center gap-1.5"><ReadinessDot readiness="intervention_required" /> Intervention required</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-600" /> Joined</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-zinc-400" /> Did not join</span>
      </div>
      <div className="card overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 border-b border-zinc-100 text-xs font-medium text-zinc-500">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
        </div>
        <div className="grid min-w-[760px] grid-cols-7">
          {cells.map((d) => {
            const key = d.toISOString().slice(0, 10);
            const list = byDay.get(key) ?? [];
            const outside = d < first || d >= next;
            const isToday = d.getTime() === today.getTime();
            return (
              <div key={key} className={`min-h-28 border-b border-r border-zinc-100 p-1.5 ${outside ? "bg-zinc-50/70" : ""}`}>
                <div className={`mb-1 text-xs ${isToday ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 font-semibold text-white" : outside ? "text-zinc-300" : "text-zinc-500"}`}>{d.getUTCDate()}</div>
                <div className="space-y-1">
                  {list.map((j) => (
                    <Link key={j.id} href={`/candidates/${j.id}`} className="flex items-center gap-1.5 rounded-md bg-zinc-50 px-1.5 py-1 text-xs hover:bg-brand-50" title={`${j.firstName} ${j.lastName} — ${j.position}`}>
                      {j.status === "pre_joining" ? <ReadinessDot readiness={j.readiness} /> : <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_STATUS[j.status]}`} />}
                      <span className="truncate">{j.firstName} {j.lastName[0] ?? ""}.</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
