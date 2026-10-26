import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { daysBetween, fmtDate } from "@/lib/dates";
import { Recorder } from "./recorder";

export const metadata: Metadata = { title: "Record a welcome", robots: { index: false } };

export default async function WelcomeRecordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const w = await db.welcomeMessage.findUnique({ where: { token }, include: { candidate: { include: { org: true } } } });
  if (!w) notFound();
  const c = w.candidate;
  const days = daysBetween(new Date(), c.joiningDate);
  const closed = w.status === "delivered" || c.status !== "pre_joining";
  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-8">
      <div className="card mx-auto max-w-lg p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-brand-600">{c.org.name} · Joining Assurance</div>
        <h1 className="mt-1 text-xl font-semibold">Welcome {c.firstName} to the team</h1>
        <p className="muted mt-1">
          {c.firstName} {c.lastName} joins as <b>{c.position}</b> on {fmtDate(c.joiningDate, { weekday: "long", month: "long", day: "numeric", year: undefined })}
          {days > 0 ? ` (in ${days} days)` : ""}. A short, personal hello from you makes a real difference to how connected new joiners feel before Day 1.
        </p>
        {closed ? (
          <p className="mt-6 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Thank you. Your welcome has already been shared with {c.firstName}.</p>
        ) : (
          <>
            {w.status === "received" && <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">We have your welcome. You can replace it below until it&apos;s shared.</p>}
            <Recorder token={token} firstName={c.firstName} />
          </>
        )}
        <p className="mt-6 text-[11px] text-zinc-400">Your message is shared only with {c.firstName} on their private joining page.</p>
      </div>
    </div>
  );
}
