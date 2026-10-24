import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { READINESS_LABEL, STATUS_LABEL } from "@/lib/constants";
import { daysBetween, fmtDate, relative } from "@/lib/dates";
import { parseReasons } from "@/lib/engine/readiness";
import { ChannelTag, Empty, PageHeader, ReadinessBadge } from "@/components/ui";

type Search = { q?: string; readiness?: string; status?: string; recruiter?: string };

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status ?? "pre_joining";
  const where: Prisma.CandidateWhereInput = { orgId: user.orgId };
  if (status !== "all") where.status = status;
  if (sp.readiness) where.readiness = sp.readiness;
  if (sp.recruiter) where.recruiterId = sp.recruiter;
  if (sp.q) where.OR = ["firstName", "lastName", "position", "email", "department"].map((f) => ({ [f]: { contains: sp.q } }));

  const [candidates, recruiters] = await Promise.all([
    db.candidate.findMany({
      where, include: { recruiter: true, _count: { select: { concerns: { where: { status: "open" } } } } },
      orderBy: status === "pre_joining" ? { joiningDate: "asc" } : { joiningDate: "desc" },
    }),
    db.user.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } }),
  ]);
  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Candidates"
        subtitle="Everyone between offer acceptance and Day 1."
        actions={<>
          <Link href="/candidates/import" className="btn-secondary">Import CSV</Link>
          <Link href="/candidates/new" className="btn-primary">+ Add accepted offer</Link>
        </>}
      />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
        <div className="min-w-48 flex-1"><label className="label">Search</label><input name="q" defaultValue={sp.q} placeholder="Name, role, department…" className="input" /></div>
        <div><label className="label">Status</label>
          <select name="status" defaultValue={status} className="input">
            <option value="all">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className="label">Readiness</label>
          <select name="readiness" defaultValue={sp.readiness ?? ""} className="input">
            <option value="">Any</option>
            {Object.entries(READINESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div><label className="label">Recruiter</label>
          <select name="recruiter" defaultValue={sp.recruiter ?? ""} className="input">
            <option value="">Anyone</option>
            {recruiters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <button className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        {candidates.length === 0 ? <Empty>No candidates match these filters.</Empty> : (
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="table-head">Candidate</th>
                <th className="table-head">Joining</th>
                <th className="table-head">Readiness</th>
                <th className="table-head">Signals</th>
                <th className="table-head">Last reply</th>
                <th className="table-head">Recruiter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {candidates.map((c) => {
                const days = daysBetween(now, c.joiningDate);
                const top = parseReasons(c.readinessReasons).find((r) => r.tone === "danger" || r.tone === "warning");
                return (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="table-cell">
                      <Link href={`/candidates/${c.id}`} className="font-medium text-zinc-900 hover:text-brand-700">{c.firstName} {c.lastName}</Link>
                      <div className="text-xs text-zinc-500">{c.position}{c.department ? ` · ${c.department}` : ""}</div>
                    </td>
                    <td className="table-cell whitespace-nowrap">
                      {fmtDate(c.joiningDate)}
                      {c.status === "pre_joining" && <div className="text-xs text-zinc-500">{days === 0 ? "today" : days > 0 ? `in ${days} days` : `${-days} days ago`}</div>}
                    </td>
                    <td className="table-cell"><ReadinessBadge readiness={c.readiness} status={c.status} /></td>
                    <td className="table-cell max-w-xs text-xs text-zinc-600">
                      {c.status === "dropped" ? c.dropoutReason : top?.text ?? (c.lastConfirmedAt ? "Confirmed" : "—")}
                      {c._count.concerns > 1 && <span className="ml-1 text-zinc-400">+{c._count.concerns - 1} more</span>}
                    </td>
                    <td className="table-cell whitespace-nowrap text-xs text-zinc-600">
                      {c.lastInboundAt ? relative(c.lastInboundAt, now) : "—"}
                      <div className="mt-0.5"><ChannelTag channel={c.preferredChannel} /></div>
                    </td>
                    <td className="table-cell text-xs text-zinc-600">{c.recruiter?.name ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
