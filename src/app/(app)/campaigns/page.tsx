import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";

export default async function CampaignsPage() {
  const user = await requireUser();
  const campaigns = await db.campaign.findMany({
    where: { orgId: user.orgId },
    include: { _count: { select: { steps: true, candidates: { where: { status: "pre_joining" } } } } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return (
    <div>
      <PageHeader title="Engagement journeys" subtitle="Configurable follow-up schedules from offer acceptance to Day 1. Each journey adapts to the candidate's notice period." />
      <div className="grid gap-4 md:grid-cols-2">
        {campaigns.map((c) => (
          <Link key={c.id} href={`/campaigns/${c.id}`} className="card block p-5 hover:border-brand-200">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">{c.name}</h2>
              {c.isDefault && <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700">Default</span>}
            </div>
            {c.description && <p className="muted mt-1">{c.description}</p>}
            <p className="mt-3 text-xs text-zinc-500">{c._count.steps} touchpoints · {c._count.candidates} active candidates</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
