"use client";
import { useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";

type Msg = { id: string; direction: string; author: string; authorName: string | null; channel: string; body: string; delivery: string; analysis: string | null; createdAt: string };

const INTENT_LABEL: Record<string, string> = {
  confirm: "Confirmed plans", arrived: "Arrived", question: "Question", concern: "Concern", date_change: "Date change",
  reconsidering: "Reconsidering", withdraw: "Withdrawal", opt_out: "Opt-out", small_talk: "General",
};
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", sms: "SMS", web: "Joining page" };

export function Conversation({ messages, candidateName, sendAction, simulateAction }: {
  messages: Msg[]; candidateName: string;
  sendAction: (f: FormData) => Promise<void>; simulateAction: (f: FormData) => Promise<void>;
}) {
  const [mode, setMode] = useState<"recruiter" | "simulate">("recruiter");
  const bottom = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  return (
    <section className="card flex flex-col">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <h2 className="h2">Conversation</h2>
        <span className="text-xs text-zinc-500">{messages.length} messages</span>
      </div>
      <div className="max-h-[560px] space-y-3 overflow-y-auto bg-zinc-50/60 px-4 py-4">
        {messages.length === 0 && <p className="muted text-center">No messages yet.</p>}
        {messages.map((m) => {
          const inbound = m.direction === "inbound";
          let analysis: { intent?: string; concerns?: { category: string; summary: string }[]; engine?: string; error?: string } | null = null;
          try { analysis = m.analysis ? JSON.parse(m.analysis) : null; } catch {}
          const who = inbound ? candidateName : m.author === "ai" ? `${m.authorName ?? "Companion"} (AI)` : m.author === "recruiter" ? m.authorName ?? "Recruiter" : "System";
          return (
            <div key={m.id} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
              <div className="max-w-[85%]">
                <div className={`whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2 text-sm ${inbound ? "rounded-bl-sm border border-zinc-200 bg-white" : m.author === "recruiter" ? "rounded-br-sm bg-zinc-800 text-white" : "rounded-br-sm bg-brand-600 text-white"}`}>
                  {m.body}
                </div>
                <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400 ${inbound ? "" : "justify-end"}`}>
                  <span>{who}</span>·<span>{CHANNEL[m.channel] ?? m.channel}</span>·
                  <span>{new Date(m.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  {m.delivery === "simulated" && <span className="rounded bg-zinc-200 px-1 text-zinc-600">simulated</span>}
                  {m.delivery === "failed" && <span className="rounded bg-red-100 px-1 text-red-700">failed{analysis?.error ? `: ${analysis.error}` : ""}</span>}
                </div>
                {inbound && analysis?.intent && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700">AI read: {INTENT_LABEL[analysis.intent] ?? analysis.intent}</span>
                    {analysis.concerns?.map((k, i) => <span key={i} className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800">⚑ {k.summary}</span>)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <div className="border-t border-zinc-100 p-3">
        <div className="mb-2 flex gap-1 text-xs">
          <button type="button" onClick={() => setMode("recruiter")} className={`rounded-md px-2 py-1 ${mode === "recruiter" ? "bg-zinc-800 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>Message as you</button>
          <button type="button" onClick={() => setMode("simulate")} className={`rounded-md px-2 py-1 ${mode === "simulate" ? "bg-brand-600 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>Test: reply as {candidateName}</button>
        </div>
        <form
          ref={form}
          action={async (f) => { await (mode === "recruiter" ? sendAction(f) : simulateAction(f)); form.current?.reset(); }}
          className="flex gap-2"
        >
          <textarea name="body" required rows={2} className="input resize-none"
            placeholder={mode === "recruiter" ? `Write to ${candidateName} (sent on their preferred channel)…` : `Type what ${candidateName} might say, e.g. "My employer asked me to stay another month" — the AI companion will respond and flag concerns.`} />
          <SubmitButton className={mode === "recruiter" ? "btn btn-secondary self-end" : "btn-primary self-end"}>{mode === "recruiter" ? "Send" : "Simulate"}</SubmitButton>
        </form>
      </div>
    </section>
  );
}
