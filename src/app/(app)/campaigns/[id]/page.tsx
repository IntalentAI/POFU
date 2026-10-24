import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, fmtDate, startOfDayUTC } from "@/lib/dates";
import { planSchedule } from "@/lib/engine/schedule";
import { TEMPLATE_VARIABLES } from "@/lib/engine/template";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteStep, duplicateCampaign, saveStep, updateCampaignMeta } from "../../actions";
import type { CampaignStep } from "@prisma/client";

const ANCHOR_LABEL: Record<string, string> = {
  after_acceptance: "days after offer acceptance",
  notice_percent: "% through the notice period",
  before_joining: "days before joining",
};

function StepForm({ campaignId, step }: { campaignId: string; step?: CampaignStep }) {
  return (
    <form action={saveStep.bind(null, campaignId, step?.id ?? null)} className="grid gap-3 sm:grid-cols-6">
      <div className="sm:col-span-3"><label className="label">Name</label><input name="name" required defaultValue={step?.name} className="input" /></div>
      <div className="sm:col-span-3"><label className="label">Objective</label><input name="objective" defaultValue={step?.objective ?? ""} className="input" /></div>
      <div className="sm:col-span-1"><label className="label">Timing</label><input name="offset" type="number" min={0} required defaultValue={step?.offset ?? 7} className="input" /></div>
      <div className="sm:col-span-2"><label className="label">&nbsp;</label>
        <select name="anchor" defaultValue={step?.anchor ?? "after_acceptance"} className="input">
          {Object.entries(ANCHOR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2"><label className="label">Type</label>
        <select name="kind" defaultValue={step?.kind ?? "message"} className="input">
          <option value="message">Message</option>
          <option value="pulse">Commitment pulse (quick replies)</option>
          <option value="arrival">Day-1 arrival check</option>
        </select>
      </div>
      <label className="flex items-end gap-2 pb-2 text-xs text-zinc-600 sm:col-span-1"><input type="checkbox" name="optional" defaultChecked={step?.optional} /> Optional</label>
      <div className="sm:col-span-6"><label className="label">Email subject</label><input name="subject" defaultValue={step?.subject ?? ""} className="input" /></div>
      <div className="sm:col-span-6"><label className="label">Message</label><textarea name="body" required rows={4} defaultValue={step?.body} className="input" /></div>
      <div className="flex justify-end gap-2 sm:col-span-6">
        <SubmitButton className="btn-primary">{step ? "Save step" : "Add step"}</SubmitButton>
      </div>
    </form>
  );
}

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await db.campaign.findFirst({ where: { id, orgId: user.orgId }, include: { steps: true } });
  if (!campaign) notFound();
  const order = (s: CampaignStep) => (s.anchor === "after_acceptance" ? s.offset : s.anchor === "notice_percent" ? 1000 + s.offset : 3000 - s.offset);
  const steps = [...campaign.steps].sort((a, b) => order(a) - order(b));

  // Preview: how the journey plays out for different notice periods.
  const today = startOfDayUTC(new Date());
  const previews = [7, 30, 60, 90].map((n) => ({ n, plan: planSchedule(campaign.steps, { offerAcceptedAt: today, joiningDate: addDays(today, n) }, today) }));

  return (
    <div>
      <div className="mb-2 text-sm"><Link href="/campaigns" className="text-zinc-500 hover:text-zinc-800">← Journeys</Link></div>
      <PageHeader
        title={campaign.name}
        subtitle="Touchpoints too close together are merged automatically; optional steps are skipped for candidates who are clearly on track."
        actions={<form action={duplicateCampaign.bind(null, campaign.id)}><SubmitButton className="btn-secondary">Duplicate</SubmitButton></form>}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {steps.map((s) => (
            <details key={s.id} className="card">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3">
                <span className="w-40 shrink-0 text-xs font-medium text-brand-700">
                  {s.anchor === "before_joining" && s.offset === 0 ? "Day 1" : `${s.offset}${s.anchor === "notice_percent" ? "%" : "d"} ${s.anchor === "after_acceptance" ? "after acceptance" : s.anchor === "notice_percent" ? "through notice" : "before joining"}`}
                </span>
                <span className="flex-1 font-medium">{s.name}</span>
                {s.kind !== "message" && <span className="rounded bg-brand-50 px-1.5 text-[11px] text-brand-700">{s.kind === "pulse" ? "pulse" : "arrival"}</span>}
                {s.optional && <span className="rounded bg-zinc-100 px-1.5 text-[11px] text-zinc-600">optional</span>}
                <span className="w-full text-xs text-zinc-500 sm:w-auto">{s.objective}</span>
              </summary>
              <div className="border-t border-zinc-100 p-5">
                <StepForm campaignId={campaign.id} step={s} />
                <form action={deleteStep.bind(null, campaign.id, s.id)} className="mt-2"><SubmitButton className="btn-ghost text-xs text-red-600">Delete step</SubmitButton></form>
              </div>
            </details>
          ))}
          <details className="card">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-brand-700">+ Add a touchpoint</summary>
            <div className="border-t border-zinc-100 p-5"><StepForm campaignId={campaign.id} /></div>
          </details>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="h2 mb-3">Journey settings</h2>
            <form action={updateCampaignMeta.bind(null, campaign.id)} className="space-y-2">
              <div><label className="label">Name</label><input name="name" defaultValue={campaign.name} className="input" /></div>
              <div><label className="label">Description</label><textarea name="description" rows={2} defaultValue={campaign.description ?? ""} className="input" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" defaultChecked={campaign.isDefault} /> Default for new candidates</label>
              <SubmitButton className="btn-secondary w-full">Save</SubmitButton>
            </form>
          </section>
          <section className="card p-5">
            <h2 className="h2 mb-1">Adaptive preview</h2>
            <p className="muted mb-3 text-xs">What a candidate accepting today receives, by notice period.</p>
            <div className="space-y-3">
              {previews.map(({ n, plan }) => (
                <div key={n}>
                  <div className="text-xs font-semibold text-zinc-700">{n}-day notice · {plan.length} touchpoints</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {plan.map((p) => <span key={p.step.id} title={fmtDate(p.day)} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700">{p.step.name}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="card p-5">
            <h2 className="h2 mb-2">Personalisation variables</h2>
            <div className="flex flex-wrap gap-1">{TEMPLATE_VARIABLES.map((v) => <code key={v} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px]">{`{{${v}}}`}</code>)}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
