import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { endSimulatedCall, simulateVoiceTurn } from "../../../../actions";
import type { Turn } from "@/lib/engine/voice";

export default async function SimulatedCallPage({ params }: { params: Promise<{ id: string; callId: string }> }) {
  const { id, callId } = await params;
  const user = await requireUser();
  const call = await db.voiceCall.findFirst({ where: { id: callId, candidateId: id, candidate: { orgId: user.orgId } }, include: { candidate: true } });
  if (!call) notFound();
  let turns: Turn[] = [];
  try { turns = JSON.parse(call.transcript); } catch {}
  const ended = Boolean(call.endedAt);

  return (
    <div className="max-w-2xl">
      <div className="mb-2 text-sm"><Link href={`/candidates/${id}`} className="text-zinc-500 hover:text-zinc-800">← {call.candidate.firstName} {call.candidate.lastName}</Link></div>
      <PageHeader
        title="Simulated voice check-in"
        subtitle="Type what the candidate says. The AI responds exactly as it would on a real call, and concerns, confirmations and the summary are recorded the same way."
      />
      <div className="card space-y-3 p-5">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.speaker === "ai" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${t.speaker === "ai" ? "rounded-bl-sm bg-brand-600 text-white" : "rounded-br-sm border border-zinc-200 bg-white"}`}>
              <div className="mb-0.5 text-[11px] opacity-70">{t.speaker === "ai" ? "🔊 AI (spoken)" : `🎙 ${call.candidate.firstName}`}</div>
              {t.text}
            </div>
          </div>
        ))}
        {ended ? (
          <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900"><span className="font-semibold">Call ended.</span> {call.summary}</div>
        ) : (
          <>
            <form action={simulateVoiceTurn.bind(null, callId)} className="flex gap-2 pt-2">
              <input name="speech" required autoFocus autoComplete="off" placeholder={`What does ${call.candidate.firstName} say?`} className="input" />
              <SubmitButton className="btn-primary shrink-0">Say</SubmitButton>
            </form>
            <form action={endSimulatedCall.bind(null, callId)}><SubmitButton className="btn-ghost text-xs">Hang up</SubmitButton></form>
          </>
        )}
        {ended && <Link href={`/candidates/${id}`} className="btn-secondary">Back to candidate</Link>}
      </div>
    </div>
  );
}
