import type { ChecklistItem, Document, VoiceCall, WelcomeMessage } from "@prisma/client";
import { CATEGORY_LABEL, ITEM_STATUS_LABEL } from "@/lib/checklist";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { SubmitButton } from "@/components/submit-button";
import { addChecklistItem, applyStandardChecklist, requestWelcomeAction, reviewChecklistItem, startVoiceCallAction } from "../../actions";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-600", submitted: "bg-sky-50 text-sky-700", verified: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700", waived: "bg-zinc-100 text-zinc-500",
};

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function ChecklistPanel({ candidateId, items, documents, active, readyAt, tz }: {
  candidateId: string; items: ChecklistItem[]; documents: Document[]; active: boolean; readyAt: Date | null; tz: string;
}) {
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.status === "verified" || i.status === "waived").length;
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3">
        <h2 className="h2">Documents & preboarding <span className="text-zinc-400">{done}/{required.length} required complete</span></h2>
        {readyAt && <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Ready for onboarding handoff · {fmtDate(readyAt, { year: undefined, timeZone: tz })}</span>}
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-6 text-sm text-zinc-500">
          No checklist for this candidate yet.
          {active && <form action={applyStandardChecklist.bind(null, candidateId)} className="mt-2"><SubmitButton className="btn-secondary">Apply standard checklist</SubmitButton></form>}
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {items.map((i) => {
            const docs = documents.filter((d) => d.checklistItemId === i.id);
            return (
              <li key={i.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{i.title}{!i.required && <span className="ml-1 text-xs font-normal text-zinc-400">(optional)</span>}</div>
                    <div className="text-xs text-zinc-500">
                      {CATEGORY_LABEL[i.category] ?? i.category}
                      {i.dueDate && i.status !== "verified" && i.status !== "waived" ? ` · due ${fmtDate(i.dueDate, { year: undefined })}` : ""}
                      {i.reviewedBy ? ` · ${i.status === "verified" ? "verified" : "reviewed"} by ${i.reviewedBy}` : ""}
                    </div>
                    {i.note && <div className="mt-0.5 text-xs text-red-700">Note: {i.note}</div>}
                    {docs.map((d) => (
                      <div key={d.id} className="mt-1 text-xs">
                        📎 <a href={`/files/${d.id}?inline=1`} target="_blank" className="text-brand-700 hover:underline">{d.fileName}</a>
                        <span className="text-zinc-400"> · {kb(d.size)} · {fmtDateTime(d.createdAt, tz)}</span>
                      </div>
                    ))}
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[i.status]}`}>{ITEM_STATUS_LABEL[i.status]}</span>
                </div>
                {active && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {i.status !== "verified" && <form action={reviewChecklistItem.bind(null, i.id, "verified")}><SubmitButton className="btn-secondary py-0.5 text-xs">Verify</SubmitButton></form>}
                    {i.status !== "waived" && i.status !== "verified" && <form action={reviewChecklistItem.bind(null, i.id, "waived")}><SubmitButton className="btn-ghost py-0.5 text-xs">Not required</SubmitButton></form>}
                    {(i.status === "verified" || i.status === "waived") && <form action={reviewChecklistItem.bind(null, i.id, "pending")}><SubmitButton className="btn-ghost py-0.5 text-xs">Reopen</SubmitButton></form>}
                    {i.status === "submitted" && (
                      <details>
                        <summary className="btn-ghost cursor-pointer list-none py-0.5 text-xs text-red-700">Request re-upload…</summary>
                        <form action={reviewChecklistItem.bind(null, i.id, "rejected")} className="mt-1 flex gap-1.5">
                          <input name="note" required placeholder="What's wrong? (sent to candidate)" className="input py-1 text-xs" />
                          <SubmitButton className="btn-danger shrink-0 py-0.5 text-xs">Send</SubmitButton>
                        </form>
                      </details>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {active && items.length > 0 && (
        <details className="border-t border-zinc-100 px-5 py-3 text-sm">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-800">+ Add an item for this candidate</summary>
          <form action={addChecklistItem.bind(null, candidateId)} className="mt-2 grid gap-2 sm:grid-cols-2">
            <input name="title" required placeholder="e.g. Work permit" className="input sm:col-span-2" />
            <input name="description" placeholder="Instructions for the candidate" className="input sm:col-span-2" />
            <input name="dueDate" type="date" className="input" />
            <div className="flex items-center gap-3 text-xs text-zinc-600">
              <label className="flex items-center gap-1"><input type="checkbox" name="required" defaultChecked /> Required</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="allowUpload" defaultChecked /> Upload</label>
            </div>
            <SubmitButton className="btn-secondary sm:col-span-2">Add item</SubmitButton>
          </form>
        </details>
      )}
    </section>
  );
}

export function WelcomePanel({ candidateId, hiringManagerEmail, welcomes, active, tz }: {
  candidateId: string; hiringManagerEmail: string | null; welcomes: WelcomeMessage[]; active: boolean; tz: string;
}) {
  const pending = welcomes.find((w) => w.status === "requested");
  const received = welcomes.filter((w) => w.status !== "requested");
  return (
    <section className="card p-5">
      <h2 className="h2 mb-3">Hiring manager welcome</h2>
      {received.map((w) => (
        <div key={w.id} className="mb-3 rounded-lg border border-zinc-200 p-3">
          <div className="mb-1 text-xs text-zinc-500">
            {w.authorName} · {w.kind} · {w.status === "delivered" ? `shared with candidate ${fmtDateTime(w.deliveredAt, tz)}` : "will be shared on the journey's welcome step"}
          </div>
          {w.kind === "text" && <p className="whitespace-pre-wrap text-sm">{w.text}</p>}
          {w.kind === "video" && <video src={`/files/${w.id}`} controls className="w-full rounded" />}
          {w.kind === "audio" && <audio src={`/files/${w.id}`} controls className="w-full" />}
        </div>
      ))}
      {pending && (
        <p className="text-sm text-zinc-600">
          Requested from {pending.authorName} {fmtDateTime(pending.requestedAt, tz)}{pending.remindedAt ? ` · reminded ${fmtDateTime(pending.remindedAt, tz)}` : ""}.
        </p>
      )}
      {!pending && received.length === 0 && (
        <p className="text-sm text-zinc-500">{hiringManagerEmail ? "No welcome requested yet." : "Add the hiring manager's email under Candidate details to ask them for a welcome."}</p>
      )}
      {active && hiringManagerEmail && received.length === 0 && (
        <form action={requestWelcomeAction.bind(null, candidateId)} className="mt-3">
          <SubmitButton className="btn-secondary w-full">{pending ? "Send reminder" : "Ask hiring manager for a welcome"}</SubmitButton>
        </form>
      )}
    </section>
  );
}

const OUTCOME: Record<string, string> = { confirmed: "Plans confirmed", concerns: "Concerns raised", declined: "Declined / call later", no_answer: "No answer", callback: "Call back later" };

export function VoicePanel({ candidateId, calls, consentAt, active, configured, tz }: {
  candidateId: string; calls: VoiceCall[]; consentAt: Date | null; active: boolean; configured: boolean; tz: string;
}) {
  return (
    <section className="card p-5">
      <h2 className="h2 mb-1">AI voice check-ins</h2>
      <p className="mb-3 text-xs text-zinc-500">
        {consentAt ? `Candidate agreed to check-in calls on ${fmtDate(consentAt, { year: undefined, timeZone: tz })}.` : "The candidate hasn't agreed to calls yet (they can opt in on their joining page)."}
        {!configured && " Calls are simulated: no voice provider configured."}
      </p>
      {calls.map((call) => {
        let transcript: { speaker: string; text: string }[] = [];
        try { transcript = JSON.parse(call.transcript); } catch {}
        return (
          <details key={call.id} className="mb-2 rounded-lg border border-zinc-200 p-3 text-sm">
            <summary className="cursor-pointer">
              <span className="font-medium">{fmtDateTime(call.createdAt, tz)}</span>
              <span className="ml-2 text-xs text-zinc-500">{call.status.replace("_", " ")}{call.outcome ? ` · ${OUTCOME[call.outcome] ?? call.outcome}` : ""}{call.provider === "simulator" ? " · simulated" : ""}</span>
            </summary>
            {call.summary && <p className="mt-2 whitespace-pre-wrap rounded bg-brand-50 p-2 text-xs text-brand-900">{call.summary}</p>}
            <div className="mt-2 space-y-1">
              {transcript.map((t, i) => <p key={i} className="text-xs"><span className="font-semibold">{t.speaker === "ai" ? "AI" : "Candidate"}:</span> {t.text}</p>)}
            </div>
          </details>
        );
      })}
      {active && (
        <form action={startVoiceCallAction.bind(null, candidateId)} className="mt-2">
          <SubmitButton className="btn-secondary w-full" disabled={!consentAt}>{configured ? "Call now" : "Run a simulated call"}</SubmitButton>
        </form>
      )}
    </section>
  );
}
