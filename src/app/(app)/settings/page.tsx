import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { channelStatus } from "@/lib/channels";
import { WEBHOOK_EVENTS } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CATEGORY_LABEL } from "@/lib/checklist";
import { addChecklistTemplateItem, deleteChecklistTemplateItem, addKnowledge, addWebhook, deleteApiKey, deleteKnowledge, deleteWebhook, updateOrgSettings } from "../actions";
import { ApiKeyForm, InviteForm } from "./forms";

function Section({ id, title, desc, children }: { id?: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-6 p-6">
      <h2 className="h2">{title}</h2>
      {desc && <p className="muted mb-4 mt-0.5">{desc}</p>}
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const org = user.org;
  const [knowledge, team, keys, hooks, checklist] = await Promise.all([
    db.knowledgeItem.findMany({ where: { orgId: org.id }, orderBy: [{ category: "asc" }, { createdAt: "asc" }] }),
    db.user.findMany({ where: { orgId: org.id }, orderBy: { name: "asc" } }),
    db.apiKey.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" } }),
    db.webhook.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" } }),
    db.checklistTemplateItem.findMany({ where: { orgId: org.id }, orderBy: { position: "asc" } }),
  ]);
  const ch = channelStatus();
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Settings" />

      <Section title="Workspace & companion" desc="How your AI joining companion introduces itself and when it may contact candidates.">
        <form action={updateOrgSettings} className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Company name</label><input name="name" defaultValue={org.name} className="input" /></div>
          <div><label className="label">Companion name</label><input name="companionName" defaultValue={org.companionName} className="input" /></div>
          <div><label className="label">Default channel</label>
            <select name="defaultChannel" defaultValue={org.defaultChannel} className="input"><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="sms">SMS</option></select>
          </div>
          <div><label className="label">Time zone (IANA)</label><input name="timezone" defaultValue={org.timezone} className="input" /></div>
          <div><label className="label">Scheduled messages go out at (hour)</label><input name="sendHour" type="number" min={0} max={23} defaultValue={org.sendHour} className="input" /></div>
          <div>
            <label className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-600">
              <input type="checkbox" name="quietHoursEnabled" defaultChecked={org.quietHoursStart !== org.quietHoursEnd} /> Quiet hours (no automated messages)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input name="quietHoursStart" type="number" min={0} max={23} defaultValue={org.quietHoursStart === org.quietHoursEnd ? 21 : org.quietHoursStart} className="input" aria-label="Quiet hours from (hour)" />
              <input name="quietHoursEnd" type="number" min={0} max={23} defaultValue={org.quietHoursStart === org.quietHoursEnd ? 9 : org.quietHoursEnd} className="input" aria-label="Quiet hours until (hour)" />
            </div>
          </div>
          <div className="sm:col-span-2 mt-2 border-t border-zinc-100 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">First-day defaults (shown on each candidate&apos;s joining page)</div>
          <div><label className="label">Arrival time</label><input name="firstDayTime" defaultValue={org.firstDayTime} className="input" /></div>
          <div><label className="label">Address</label><input name="firstDayAddress" defaultValue={org.firstDayAddress ?? ""} placeholder="123 Market St, San Francisco" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">What to bring / who to ask for</label><textarea name="firstDayNotes" rows={2} defaultValue={org.firstDayNotes ?? ""} placeholder="Bring your photo ID. Ask for the People team at reception." className="input" /></div>
          <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save settings</SubmitButton></div>
        </form>
      </Section>

      <Section id="knowledge" title="Approved answers" desc="The companion answers candidate questions only from these employer-approved answers. Anything else is escalated to the recruiter.">
        <ul className="mb-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {knowledge.map((k) => (
            <li key={k.id} className="flex gap-3 p-3">
              <div className="flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">{k.category}</div>
                <div className="text-sm font-medium">{k.question}</div>
                <div className="text-sm text-zinc-600">{k.answer}</div>
              </div>
              <form action={deleteKnowledge.bind(null, k.id)}><SubmitButton className="btn-ghost text-xs text-red-600">Remove</SubmitButton></form>
            </li>
          ))}
        </ul>
        <form action={addKnowledge} className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_3fr]">
            <input name="category" list="kb-categories" placeholder="Category" className="input" />
            <datalist id="kb-categories">{[...new Set(["General", "First day", "Documents", "Benefits", "Equipment", "Relocation", "Pay", ...knowledge.map((k) => k.category)])].map((c) => <option key={c} value={c} />)}</datalist>
            <input name="question" placeholder="Question, e.g. Is there parking at the office?" required className="input" />
          </div>
          <textarea name="answer" placeholder="Approved answer" required rows={2} className="input" />
          <div className="flex justify-end"><SubmitButton className="btn-secondary">Add answer</SubmitButton></div>
        </form>
      </Section>

      <Section id="checklist" title="Documentation checklist" desc="Copied to every new candidate. Candidates upload files securely on their joining page; you verify them on the candidate's page. Files are private and never sent over chat.">
        <ul className="mb-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {checklist.map((t) => (
            <li key={t.id} className="flex items-start gap-3 p-3">
              <div className="flex-1">
                <div className="text-sm font-medium">{t.title} {!t.required && <span className="text-xs font-normal text-zinc-400">(optional)</span>}</div>
                <div className="text-xs text-zinc-500">{CATEGORY_LABEL[t.category] ?? t.category} · due {t.dueDaysBeforeJoining} days before joining · {t.allowUpload ? "candidate uploads a file" : "no upload (tracked by HR)"}</div>
                {t.description && <div className="text-xs text-zinc-600">{t.description}</div>}
              </div>
              <form action={deleteChecklistTemplateItem.bind(null, t.id)}><SubmitButton className="btn-ghost text-xs text-red-600">Remove</SubmitButton></form>
            </li>
          ))}
        </ul>
        <form action={addChecklistTemplateItem} className="grid gap-2 sm:grid-cols-4">
          <input name="title" required placeholder="Item, e.g. Work permit" className="input sm:col-span-2" />
          <select name="category" className="input">{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="dueDaysBeforeJoining" type="number" min={0} defaultValue={7} className="input" aria-label="Due days before joining" />
          <input name="description" placeholder="Instructions for the candidate" className="input sm:col-span-4" />
          <div className="flex items-center gap-4 text-xs text-zinc-600 sm:col-span-3">
            <label className="flex items-center gap-1"><input type="checkbox" name="required" defaultChecked /> Required</label>
            <label className="flex items-center gap-1"><input type="checkbox" name="allowUpload" defaultChecked /> Candidate uploads a file</label>
          </div>
          <SubmitButton className="btn-secondary">Add item</SubmitButton>
        </form>
      </Section>

      <Section title="Team" desc="Recruiters, HR operations and hiring managers who receive alerts.">
        <ul className="mb-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {team.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-3 text-sm">
              <span><span className="font-medium">{t.name}</span> <span className="text-zinc-500">{t.email}</span></span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{t.role.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
        <InviteForm />
      </Section>

      <Section title="Channels" desc="Configure providers with environment variables (see README). Without a provider, messages are recorded as simulated so you can trial the product.">
        <ul className="space-y-2 text-sm">
          {[
            ["WhatsApp", ch.whatsapp, `${base}/api/webhooks/twilio  or  ${base}/api/webhooks/whatsapp (Meta)`],
            ["Email", ch.email, `${base}/api/webhooks/email`],
            ["SMS", ch.sms, `${base}/api/webhooks/twilio`],
            ["Voice calls", ch.voice, "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VOICE_FROM for AI voice check-ins; otherwise calls run in the simulator."],
            ["File storage", "Cloudflare R2", "Candidate documents and welcome recordings (private bucket, binding FILES)."],
            ["AI companion", ch.ai ? `Claude · ${ch.ai}` : null, "Set ANTHROPIC_API_KEY to enable Claude; otherwise a rules engine is used."],
          ].map(([name, status, hint]) => (
            <li key={name} className="flex flex-wrap items-start gap-3 rounded-lg border border-zinc-200 p-3">
              <span className="w-28 font-medium">{name}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs ${status ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{status ?? "Simulated"}</span>
              <span className="min-w-0 flex-1 break-all text-xs text-zinc-500">Inbound: {hint}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="api" title="API & webhooks" desc="Connect any ATS or HRIS: enroll candidates when an offer is accepted and receive events when something changes.">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">API keys</h3>
        <ul className="mb-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {keys.length === 0 && <li className="p-3 text-sm text-zinc-500">No API keys yet.</li>}
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between p-3 text-sm">
              <span><span className="font-medium">{k.name}</span> <code className="text-xs text-zinc-500">{k.prefix}…</code></span>
              <span className="flex items-center gap-3 text-xs text-zinc-500">
                {k.lastUsedAt ? `used ${fmtDate(k.lastUsedAt)}` : "never used"}
                <form action={deleteApiKey.bind(null, k.id)}><SubmitButton className="btn-ghost text-xs text-red-600">Revoke</SubmitButton></form>
              </span>
            </li>
          ))}
        </ul>
        <ApiKeyForm />

        <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Webhooks</h3>
        <ul className="mb-3 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {hooks.length === 0 && <li className="p-3 text-sm text-zinc-500">No webhooks yet.</li>}
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="min-w-0 break-all"><span className="font-medium">{h.url}</span><br /><span className="text-xs text-zinc-500">Events: {h.events} · Signing secret: <code>{h.secret}</code></span></span>
              <form action={deleteWebhook.bind(null, h.id)}><SubmitButton className="btn-ghost text-xs text-red-600">Remove</SubmitButton></form>
            </li>
          ))}
        </ul>
        <form action={addWebhook} className="flex flex-wrap gap-2">
          <input name="url" type="url" required placeholder="https://your-ats.example.com/hooks/intalent" className="input min-w-64 flex-1" />
          <input name="events" placeholder="* or comma-separated events" className="input w-56" />
          <SubmitButton className="btn-secondary">Add webhook</SubmitButton>
        </form>
        <p className="mt-2 text-xs text-zinc-500">Events: {WEBHOOK_EVENTS.join(", ")}. Payloads are signed with HMAC-SHA256 in the <code>x-intalent-signature</code> header.</p>

        <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Enroll a candidate on offer acceptance</h3>
        <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-100">{`curl -X POST ${base}/api/v1/candidates \\
  -H "Authorization: Bearer $JA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "externalId": "ATS-12345",
    "firstName": "Sarah", "lastName": "Johnson",
    "email": "sarah@example.com", "phone": "+14155550123",
    "preferredChannel": "whatsapp",
    "position": "Senior Software Engineer", "department": "Engineering",
    "location": "San Francisco HQ", "hiringManagerName": "Dana Whitfield",
    "recruiterEmail": "${user.email}",
    "offerAcceptedAt": "2026-10-24", "joiningDate": "2026-11-15"
  }'`}</pre>
        <p className="mt-2 text-xs text-zinc-500">Also: <code>GET /api/v1/candidates</code>, <code>GET /api/v1/candidates/:id</code> (id or externalId), <code>PATCH /api/v1/candidates/:id</code> with <code>joiningDate</code>, <code>status</code> (joined, dropped, offer_rescinded) or <code>checklist</code> updates (e.g. from a background-check vendor).</p>
        <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Onboarding handoff to your HRIS</h3>
        <p className="text-xs text-zinc-600">
          When every required document is verified, POFU sends <code>candidate.ready_for_onboarding</code> with the candidate&apos;s profile, checklist and
          signed document links (valid 24 hours) so your HRIS can import them. Pull the same package any time with <code>GET /api/v1/candidates/:id/onboarding</code>.
        </p>
      </Section>
    </div>
  );
}
