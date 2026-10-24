import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { daysBetween, fmtDate } from "@/lib/dates";
import { SubmitButton } from "@/components/submit-button";
import { requestHuman, sendFromPortal } from "./actions";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Your joining companion", robots: { index: false } };

export default async function JoiningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await db.candidate.findUnique({
    where: { portalToken: token },
    include: { org: true, recruiter: true, messages: { orderBy: { createdAt: "asc" }, take: 200 }, scheduled: { where: { status: "sent" } } },
  });
  if (!c || c.status === "offer_rescinded") notFound();
  const org = c.org;
  const days = daysBetween(new Date(), c.joiningDate);
  const sent = new Set(c.scheduled.map((s) => s.stepKey));
  const journey = [
    { label: "Offer accepted", done: true },
    { label: "Welcome", done: sent.has("welcome") },
    { label: "Preparing to join", done: sent.has("documentation") || sent.has("logistics") },
    { label: "Joining confirmation", done: Boolean(c.lastConfirmedAt && (sent.has("pulse_confirm") || days <= 7)) },
    { label: "First day", done: c.status === "joined" },
  ];

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col bg-white sm:my-6 sm:min-h-0 sm:rounded-2xl sm:shadow">
        <header className="rounded-t-none bg-brand-600 px-5 pb-5 pt-6 text-white sm:rounded-t-2xl">
          <div className="text-xs font-medium uppercase tracking-wide opacity-80">{org.name}</div>
          <h1 className="mt-1 text-xl font-semibold">
            {c.status === "joined" ? `Welcome aboard, ${c.firstName}!` : `Welcome to ${org.name}, ${c.firstName}!`}
          </h1>
          {c.status === "pre_joining" && (
            <p className="mt-1 text-sm opacity-90">
              {days > 1 ? <><span className="text-2xl font-bold">{days}</span> days until your first day.</> : days === 1 ? "Your first day is tomorrow!" : days === 0 ? "Today is your first day! 🎉" : "We're looking forward to having you."}
            </p>
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

        <section className="grid grid-cols-2 gap-3 border-b border-zinc-100 px-5 py-4 text-sm">
          <div><div className="text-xs text-zinc-500">Your first day</div><div className="font-medium">{fmtDate(c.joiningDate, { weekday: "short", month: "short", day: "numeric", year: undefined })}</div></div>
          <div><div className="text-xs text-zinc-500">Where</div><div className="font-medium">{c.location ?? "To be confirmed"}</div></div>
          <div><div className="text-xs text-zinc-500">Role</div><div className="font-medium">{c.position}</div></div>
          <div><div className="text-xs text-zinc-500">Your manager</div><div className="font-medium">{c.hiringManagerName ?? "To be confirmed"}</div></div>
        </section>

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
        <footer className="px-5 pb-5 pt-2 text-[11px] leading-relaxed text-zinc-400">
          You&apos;re chatting with an AI assistant on behalf of {org.name}. It can&apos;t change your offer or approve requests — it passes them to your recruiter{c.recruiter ? ` (${c.recruiter.name})` : ""}.
          Please never share ID documents or bank details here; HR will send a secure link. Reply STOP to stop automated messages.
        </footer>
      </div>
    </div>
  );
}
