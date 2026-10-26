import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { daysBetween, fmtDate } from "@/lib/dates";
import { ITEM_STATUS_LABEL, isDone } from "@/lib/checklist";
import { SubmitButton } from "@/components/submit-button";
import { acknowledgeItem, requestHuman, sendFromPortal, setVoiceConsent } from "./actions";
import { Composer } from "./composer";
import { Uploader } from "./uploader";

export const metadata: Metadata = { title: "Your joining companion", robots: { index: false } };

const CHIP: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-600", submitted: "bg-sky-50 text-sky-700", verified: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700", waived: "bg-zinc-100 text-zinc-500",
};

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="border-b border-zinc-100 px-5 py-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function JoiningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await db.candidate.findUnique({
    where: { portalToken: token },
    include: {
      org: true, recruiter: true,
      messages: { where: { author: { not: "system" }, channel: { not: "voice" } }, orderBy: { createdAt: "asc" }, take: 200 },
      scheduled: { where: { status: "sent" } },
      checklist: { orderBy: { position: "asc" } },
      welcomes: { where: { status: "delivered" }, orderBy: { deliveredAt: "asc" } },
    },
  });
  if (!c || c.status === "offer_rescinded") notFound();
  const org = c.org;
  const days = daysBetween(new Date(), c.joiningDate);
  const active = c.status === "pre_joining";
  const sent = new Set(c.scheduled.map((s) => s.stepKey));
  const required = c.checklist.filter((i) => i.required);
  const requiredDone = required.filter(isDone).length;
  const todo = c.checklist.filter((i) => !isDone(i));
  const journey = [
    { label: "Offer accepted", done: true },
    { label: "Welcome", done: sent.has("welcome") },
    { label: "Documents", done: required.length > 0 ? requiredDone === required.length : sent.has("documentation") },
    { label: "Joining confirmed", done: Boolean(c.lastConfirmedAt && (sent.has("pulse_confirm") || days <= 7)) },
    { label: "First day", done: c.status === "joined" },
  ];
  const firstDay = {
    time: c.firstDayTime || org.firstDayTime,
    address: c.firstDayAddress || org.firstDayAddress || c.location,
    notes: c.firstDayNotes || org.firstDayNotes,
  };

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-white sm:my-6 sm:min-h-0 sm:rounded-2xl sm:shadow">
        <header className="rounded-t-none bg-brand-600 px-5 pb-5 pt-6 text-white sm:rounded-t-2xl">
          <div className="text-xs font-medium uppercase tracking-wide opacity-80">{org.name}</div>
          <h1 className="mt-1 text-xl font-semibold">
            {c.status === "joined" ? `Welcome aboard, ${c.firstName}!` : `Welcome to ${org.name}, ${c.firstName}!`}
          </h1>
          {active && (
            <p className="mt-1 text-sm opacity-90">
              {days > 1 ? <><span className="text-2xl font-bold">{days}</span> days until your first day.</> : days === 1 ? "Your first day is tomorrow!" : days === 0 ? "Today is your first day! 🎉" : "We're looking forward to having you."}
            </p>
          )}
          {active && todo.length > 0 && (
            <a href="#todo" className="mt-3 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium hover:bg-white/25">
              {todo.length} thing{todo.length === 1 ? "" : "s"} to complete →
            </a>
          )}
        </header>

        <section className="border-b border-zinc-100 px-5 py-4">
          <ol className="flex justify-between">
            {journey.map((s, i) => (
              <li key={s.label} className="flex flex-1 flex-col items-center text-center">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? "bg-brand-600 text-white" : "bg-zinc-200 text-zinc-500"}`}>{s.done ? "✓" : i + 1}</span>
                <span className="mt-1 text-[10px] leading-tight text-zinc-600">{s.label}</span>
              </li>
            ))}
          </ol>
        </section>

        {c.checklist.length > 0 && (
          <Card id="todo" title={`Things to complete · ${requiredDone}/${required.length} done`}>
            <ul className="space-y-3">
              {c.checklist.map((i) => (
                <li key={i.id} className="rounded-lg border border-zinc-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{i.title}{!i.required && <span className="ml-1 text-xs font-normal text-zinc-400">optional</span>}</div>
                      {i.description && <div className="text-xs text-zinc-500">{i.description}</div>}
                      {i.dueDate && !isDone(i) && <div className="mt-0.5 text-xs text-zinc-500">Please complete by {fmtDate(i.dueDate, { weekday: "short", month: "short", day: "numeric", year: undefined })}</div>}
                      {i.status === "rejected" && i.note && <div className="mt-1 text-xs text-red-700">{i.note}</div>}
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${CHIP[i.status]}`}>{ITEM_STATUS_LABEL[i.status]}</span>
                  </div>
                  {active && !isDone(i) && (
                    <div className="mt-2">
                      {i.allowUpload ? (
                        <Uploader token={token} itemId={i.id} label={i.status === "pending" ? "Upload file" : "Upload a new copy"} />
                      ) : i.category !== "background" ? (
                        <form action={acknowledgeItem.bind(null, token, i.id)}><SubmitButton className="btn-secondary py-1 text-xs">Mark as done</SubmitButton></form>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-zinc-400">Files are stored securely and shared only with the {org.name} HR team. PDF or photo, up to 10 MB.</p>
          </Card>
        )}

        <Card title="Your first day">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-zinc-500">Date</dt><dd className="font-medium">{fmtDate(c.joiningDate, { weekday: "short", month: "short", day: "numeric", year: undefined })}</dd></div>
            <div><dt className="text-xs text-zinc-500">Arrive at</dt><dd className="font-medium">{firstDay.time}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-zinc-500">Where</dt><dd className="font-medium">{firstDay.address ?? "To be confirmed"}</dd></div>
            <div><dt className="text-xs text-zinc-500">Role</dt><dd className="font-medium">{c.position}</dd></div>
            <div><dt className="text-xs text-zinc-500">Your manager</dt><dd className="font-medium">{c.hiringManagerName ?? "To be confirmed"}</dd></div>
          </dl>
          {firstDay.notes && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">{firstDay.notes}</p>}
        </Card>

        {c.welcomes.length > 0 && (
          <Card id="team" title="Meet your team">
            {c.welcomes.map((w) => (
              <div key={w.id} className="mb-3">
                <div className="mb-1 text-xs text-zinc-500">A welcome from {w.authorName}, {w.authorRole.toLowerCase()}</div>
                {w.kind === "text" && <p className="whitespace-pre-wrap rounded-lg bg-brand-50 p-3 text-sm text-brand-900">“{w.text}”</p>}
                {w.kind === "video" && <video src={`/j/${token}/media/${w.id}`} controls playsInline className="w-full rounded-lg" />}
                {w.kind === "audio" && <audio src={`/j/${token}/media/${w.id}`} controls className="w-full" />}
              </div>
            ))}
          </Card>
        )}

        <section className="flex flex-1 flex-col">
          <div className="flex items-center justify-between px-5 pt-4">
            <div>
              <div className="text-sm font-semibold">{org.companionName}, your joining companion</div>
              <div className="text-xs text-zinc-500">AI assistant · answers from {org.name}-approved information</div>
            </div>
            <form action={requestHuman.bind(null, token)}><SubmitButton className="btn-secondary py-1 text-xs" pendingText="Requesting…">Talk to a person</SubmitButton></form>
          </div>
          <div className="flex-1 space-y-2 px-4 py-4">
            {c.messages.map((m) => {
              const mine = m.direction === "inbound";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-zinc-100 text-zinc-900"}`}>
                    {!mine && m.author === "recruiter" && <div className="mb-0.5 text-[11px] font-semibold text-zinc-500">{m.authorName}</div>}
                    {m.body}
                  </div>
                </div>
              );
            })}
          </div>
          {c.status === "pre_joining" || c.status === "joined" ? <Composer action={sendFromPortal.bind(null, token)} /> : null}
        </section>

        {active && c.phone && (
          <section className="border-t border-zinc-100 px-5 py-4">
            <form action={setVoiceConsent.bind(null, token, !c.voiceConsentAt)} className="flex items-center justify-between gap-3">
              <div className="text-xs text-zinc-600">
                <div className="font-medium text-zinc-800">Quick check-in calls</div>
                {c.voiceConsentAt
                  ? `You've agreed to an occasional 2-minute call from ${org.companionName}, our AI assistant. You can stop these any time.`
                  : `Prefer talking to typing? ${org.companionName}, our AI assistant, can give you an occasional 2-minute call. You can say "call me later" or ask for a person any time.`}
              </div>
              <SubmitButton className="btn-secondary shrink-0 py-1 text-xs">{c.voiceConsentAt ? "Stop calls" : "Allow calls"}</SubmitButton>
            </form>
          </section>
        )}

        <footer className="px-5 pb-5 pt-2 text-[11px] leading-relaxed text-zinc-400">
          You&apos;re chatting with an AI assistant on behalf of {org.name}. It can&apos;t change your offer or approve requests — it passes them to your recruiter{c.recruiter ? ` (${c.recruiter.name})` : ""}.
          Please upload documents only under “Things to complete”, never in the chat. Reply STOP to stop automated messages.
        </footer>
      </div>
    </div>
  );
}
