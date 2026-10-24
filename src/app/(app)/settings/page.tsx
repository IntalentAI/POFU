import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { channelStatus } from "@/lib/channels";
import { WEBHOOK_EVENTS } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addKnowledge, addWebhook, deleteApiKey, deleteKnowledge, deleteWebhook, updateOrgSettings } from "../actions";
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
  const [knowledge, team, keys, hooks] = await Promise.all([
    db.knowledgeItem.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } }),
    db.user.findMany({ where: { orgId: org.id }, orderBy: { name: "asc" } }),
    db.apiKey.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" } }),
    db.webhook.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" } }),
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
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Quiet hours from</label><input name="quietHoursStart" type="number" min={0} max={23} defaultValue={org.quietHoursStart} className="input" /></div>
            <div><label className="label">until</label><input name="quietHoursEnd" type="number" min={0} max={23} defaultValue={org.quietHoursEnd} className="input" /></div>
          </div>
          <div className="sm:col-span-2 flex justify-end"><SubmitButton>Save settings</SubmitButton></div>
        </form>
      </Section>

      <Section id="knowledge" title="Approved answers" desc="The companion answers candidate questions only from these employer-approved answers. Anything else is escalated to the recruiter.">
        <ul className="mb-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
          {knowledge.map((k) => (
            <li key={k.id} className="flex gap-3 p-3">
              <div className="flex-1">
                <div className="text-sm font-medium">{k.question}</div>
                <div className="text-sm text-zinc-600">{k.answer}</div>
              </div>
              <form action={deleteKnowledge.bind(null, k.id)}><SubmitButton className="btn-ghost text-xs text-red-600">Remove</SubmitButton></form>
            </li>
          ))}
        </ul>
        <form action={addKnowledge} className="grid gap-2">
          <input name="question" placeholder="Question, e.g. Is there parking at the office?" required className="input" />
          <textarea name="answer" placeholder="Approved answer" required rows={2} className="input" />
          <div className="flex justify-end"><SubmitButton className="btn-secondary">Add answer</SubmitButton></div>
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
        <p className="mt-2 text-xs text-zinc-500">Also: <code>GET /api/v1/candidates</code>, <code>GET /api/v1/candidates/:id</code> (id or externalId), <code>PATCH /api/v1/candidates/:id</code> with <code>joiningDate</code> or <code>status</code> (joined, dropped, offer_rescinded).</p>
      </Section>
    </div>
  );
}
