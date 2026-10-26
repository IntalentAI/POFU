import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CONCERN_CATEGORIES, DROPOUT_REASONS, LANGUAGES, OWNER_LABEL, type ConcernCategory } from "@/lib/constants";
import { daysBetween, fmtDate, fmtDateTime, fmtHour, isQuietHour, toDateInput } from "@/lib/dates";
import { parseReasons } from "@/lib/engine/readiness";
import { portalUrl } from "@/lib/engine/template";
import { recommendAction } from "@/lib/recommend";
import { Avatar, ChannelTag, PageHeader, ReadinessBadge, ReasonList } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import {
  addConcernManually, changeDate, markStatus, rebuildCandidateSchedule, resolveConcernAction,
  sendRecruiterMessage, simulateCandidateReply, togglePause, updateCandidateDetails,
} from "../../actions";
import { Conversation } from "./conversation";
import { ChecklistPanel, VoicePanel, WelcomePanel } from "./panels";
import { voiceConfigured } from "@/lib/engine/voice";

const STEP_KIND_LABEL: Record<string, string> = {
  pulse: "commitment pulse", arrival: "arrival check", welcome: "manager welcome", docs: "only if items outstanding", voice: "voice call",
};

const STAGES = [
  { label: "Offer accepted", keys: [] as string[] },
  { label: "Welcome", keys: ["welcome", "offer_clarification"] },
  { label: "Notice period", keys: ["transition_checkin", "team_intro", "pulse_mid", "hm_message"] },
  { label: "Preparation", keys: ["documentation", "logistics"] },
  { label: "Joining confirmation", keys: ["pulse_confirm", "first_day"] },
  { label: "Day 1", keys: ["day1"] },
];

export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const c = await db.candidate.findFirst({
    where: { id, orgId: user.orgId },
    include: {
      recruiter: true,
      messages: { orderBy: { createdAt: "asc" } },
      concerns: { orderBy: { createdAt: "desc" } },
      scheduled: { orderBy: { scheduledFor: "asc" }, include: { step: true } },
      events: { orderBy: { createdAt: "desc" }, take: 40 },
      checklist: { orderBy: { position: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      welcomes: { orderBy: { requestedAt: "desc" } },
      calls: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!c) notFound();
  const recruiters = await db.user.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } });
  const now = new Date();
  const days = daysBetween(now, c.joiningDate);
  const reasons = parseReasons(c.readinessReasons);
  const open = c.concerns.filter((k) => k.status === "open");
  const resolved = c.concerns.filter((k) => k.status !== "open");
  const rec = recommendAction(open, reasons);
  const active = c.status === "pre_joining";
  const sentKeys = new Set(c.scheduled.filter((s) => s.status === "sent").map((s) => s.stepKey));
  const stageDone = (i: number) => i === 0 || (i === 5 ? c.status === "joined" : STAGES[i].keys.some((k) => sentKeys.has(k)));
  const tz = user.org.timezone;
  const quietNow = isQuietHour(now, tz, user.org.quietHoursStart, user.org.quietHoursEnd);
  // Why a due engagement hasn't gone out yet (the scheduler runs every 5 minutes).
  const pendingNote = (s: { status: string; scheduledFor: Date }) => {
    if (s.status !== "scheduled" || s.scheduledFor > now) return null;
    if (c.engagementPaused) return "Held: engagement is paused";
    if (quietNow) return `Held for quiet hours: sends after ${fmtHour(user.org.quietHoursEnd)}`;
    return "Due: sends within 5 minutes";
  };
  const commitment = c.events.filter((e) => ["confirmed", "concern_raised", "concern_resolved", "joining_date_changed", "status_changed"].includes(e.type));

  return (
    <div>
      <div className="mb-2 text-sm"><Link href="/candidates" className="text-zinc-500 hover:text-zinc-800">← Candidates</Link></div>
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        subtitle={`${c.position}${c.department ? ` · ${c.department}` : ""}${c.location ? ` · ${c.location}` : ""}`}
        actions={active ? <>
          <form action={togglePause.bind(null, c.id)}><SubmitButton className="btn-secondary">{c.engagementPaused ? "Resume engagement" : "Pause engagement"}</SubmitButton></form>
          <form action={markStatus.bind(null, c.id, "joined")}><SubmitButton className="btn-secondary">Mark joined</SubmitButton></form>
          <details className="relative">
            <summary className="btn-danger list-none cursor-pointer">Did not join…</summary>
            <form action={markStatus.bind(null, c.id, "dropped")} className="card absolute right-0 z-10 mt-2 w-72 space-y-3 p-4 shadow-lg">
              <label className="label">Reason</label>
              <select name="reason" className="input">{DROPOUT_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
              <SubmitButton className="btn-danger w-full">Record as did not join</SubmitButton>
            </form>
          </details>
        </> : (
          <form action={markStatus.bind(null, c.id, "pre_joining")}><SubmitButton className="btn-secondary">Reopen</SubmitButton></form>
        )}
      />

      <div className="card mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div><div className="label">Status</div><ReadinessBadge readiness={c.readiness} status={c.status} /></div>
        <div>
          <div className="label">Joining date</div>
          <div className="text-sm font-medium">{fmtDate(c.joiningDate, { weekday: "short" })}</div>
          {active && <div className="text-xs text-zinc-500">{days === 0 ? "Today" : days > 0 ? `${days} days to go` : `${-days} days ago`}</div>}
        </div>
        <div><div className="label">Recruiter</div><div className="text-sm">{c.recruiter?.name ?? "—"}</div><div className="text-xs text-zinc-500">HM: {c.hiringManagerName ?? "—"}</div></div>
        <div>
          <div className="label">Contact</div>
          <div className="truncate text-sm">{c.email ?? c.phone ?? "—"}</div>
          <div className="mt-0.5 flex gap-1"><ChannelTag channel={c.preferredChannel} />{c.optedOut && <span className="text-xs text-red-600">opted out</span>}{c.engagementPaused && <span className="text-xs text-amber-700">paused</span>}</div>
        </div>
        <div>
          <div className="label">Joining page</div>
          <a href={portalUrl(c.portalToken)} target="_blank" className="text-sm text-brand-700 hover:underline">Open candidate view ↗</a>
          <div className="text-xs text-zinc-500">Accepted {fmtDate(c.offerAcceptedAt)}</div>
        </div>
      </div>

      {/* Journey progress */}
      <div className="card mb-6 overflow-x-auto p-5">
        <ol className="flex min-w-[640px] items-center">
          {STAGES.map((s, i) => (
            <li key={s.label} className="flex flex-1 items-center">
              <div className="flex flex-col items-center text-center">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${stageDone(i) ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-500"}`}>{stageDone(i) ? "✓" : i + 1}</span>
                <span className="mt-1 w-24 text-xs text-zinc-600">{s.label}</span>
              </div>
              {i < STAGES.length - 1 && <div className={`mb-5 h-0.5 flex-1 ${stageDone(i + 1) ? "bg-brand-600" : "bg-zinc-200"}`} />}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Conversation
            messages={c.messages.map((m) => ({ id: m.id, direction: m.direction, author: m.author, authorName: m.authorName, channel: m.channel, body: m.body, delivery: m.delivery, analysis: m.analysis, createdAt: m.createdAt.toISOString() }))}
            candidateName={c.firstName}
            timeZone={tz}
            sendAction={sendRecruiterMessage.bind(null, c.id)}
            simulateAction={simulateCandidateReply.bind(null, c.id)}
          />

          <ChecklistPanel candidateId={c.id} items={c.checklist} documents={c.documents} active={active} readyAt={c.onboardingReadyAt} tz={tz} />

          <section className="card">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
              <h2 className="h2">Engagement schedule</h2>
              {active && <form action={rebuildCandidateSchedule.bind(null, c.id)}><SubmitButton className="btn-ghost text-xs">Rebuild schedule</SubmitButton></form>}
            </div>
            <ul className="divide-y divide-zinc-100">
              {c.scheduled.filter((s) => s.status !== "cancelled").map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className={`w-20 shrink-0 text-xs font-medium ${s.status === "sent" ? "text-emerald-600" : s.status === "scheduled" ? "text-brand-600" : s.status === "failed" ? "text-red-600" : "text-zinc-400"}`}>{s.status}</span>
                  <span className="flex-1">{s.step?.name ?? s.stepKey}{STEP_KIND_LABEL[s.kind] && <span className="ml-2 rounded bg-brand-50 px-1.5 text-[11px] text-brand-700">{STEP_KIND_LABEL[s.kind]}</span>}
                    {s.statusReason && s.status !== "sent" && <div className="text-xs text-zinc-400">{s.statusReason}</div>}
                    {pendingNote(s) && <div className="text-xs text-amber-700">{pendingNote(s)}</div>}
                  </span>
                  <span className="whitespace-nowrap text-xs text-zinc-500">{fmtDateTime(s.sentAt ?? s.scheduledFor, tz)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          {active && (
            <section className="card p-5">
              <h2 className="h2 mb-3">Readiness indicators</h2>
              <ReasonList reasons={reasons} />
              {rec && <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900"><span className="font-semibold">Suggested action:</span> {rec}</div>}
            </section>
          )}

          <section className="card">
            <div className="border-b border-zinc-100 px-5 py-3"><h2 className="h2">Open concerns <span className="text-zinc-400">{open.length}</span></h2></div>
            <div className="space-y-3 p-4">
              {open.length === 0 && <p className="muted px-1">No open concerns.</p>}
              {open.map((k) => {
                const meta = CONCERN_CATEGORIES[k.category as ConcernCategory] ?? CONCERN_CATEGORIES.other;
                return (
                  <div key={k.id} className={`rounded-lg border p-3 ${k.severity === "high" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold uppercase tracking-wide text-zinc-700">{meta.label}</span>
                      <span className="text-zinc-500">{fmtDate(k.createdAt, { year: undefined, timeZone: tz })} · {OWNER_LABEL[k.owner]}</span>
                    </div>
                    <p className="mt-1 text-sm">{k.summary}</p>
                    <p className="mt-1 text-xs text-zinc-600">→ {k.suggestedAction}</p>
                    {k.category === "joining_date_change" && (
                      <form action={changeDate.bind(null, c.id)} className="mt-3 space-y-2 border-t border-zinc-200 pt-3">
                        <input type="hidden" name="concernId" value={k.id} />
                        <input type="hidden" name="reason" value="Approved candidate request" />
                        <label className="label">Approve new joining date</label>
                        <div className="flex gap-2">
                          <input type="date" name="joiningDate" required defaultValue={k.requestedDate ? toDateInput(k.requestedDate) : ""} className="input" />
                          <SubmitButton className="btn-primary shrink-0">Approve</SubmitButton>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" name="notify" defaultChecked /> Notify candidate</label>
                      </form>
                    )}
                    {k.category === "unanswered_question" && (
                      <form action={resolveConcernAction.bind(null, k.id)} className="mt-3 space-y-2 border-t border-zinc-200 pt-3">
                        <label className="label">Answer {c.firstName}</label>
                        <textarea name="answer" required rows={2} className="input" placeholder="Sent to the candidate on their channel" />
                        <label className="flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" name="saveToKnowledge" defaultChecked /> Save to approved answers so the companion can answer this next time</label>
                        <SubmitButton className="btn-primary w-full">Send answer & resolve</SubmitButton>
                      </form>
                    )}
                    <form action={resolveConcernAction.bind(null, k.id)} className="mt-2 flex gap-2">
                      <input name="resolution" placeholder="Resolution note" className="input py-1 text-xs" />
                      <SubmitButton className="btn-secondary shrink-0 py-1 text-xs">Resolve</SubmitButton>
                    </form>
                  </div>
                );
              })}
              {active && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-800">+ Record a concern</summary>
                  <form action={addConcernManually.bind(null, c.id)} className="mt-2 space-y-2">
                    <select name="category" className="input">{Object.entries(CONCERN_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                    <input name="summary" placeholder="What did you hear?" required className="input" />
                    <SubmitButton className="btn-secondary w-full">Add concern</SubmitButton>
                  </form>
                </details>
              )}
            </div>
          </section>

          {active && (
            <section className="card p-5">
              <h2 className="h2 mb-3">Change joining date</h2>
              <form action={changeDate.bind(null, c.id)} className="space-y-2">
                <input type="date" name="joiningDate" required defaultValue={toDateInput(c.joiningDate)} className="input" />
                <input name="reason" placeholder="Reason (optional)" className="input" />
                <label className="flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" name="notify" defaultChecked /> Notify candidate</label>
                <SubmitButton className="btn-secondary w-full">Update date & reschedule</SubmitButton>
              </form>
              <p className="mt-2 text-xs text-zinc-500">The engagement schedule is rebuilt automatically for the new date.</p>
            </section>
          )}

          <WelcomePanel candidateId={c.id} hiringManagerEmail={c.hiringManagerEmail} welcomes={c.welcomes} active={active} tz={tz} />
          <VoicePanel candidateId={c.id} calls={c.calls} consentAt={c.voiceConsentAt} active={active} configured={voiceConfigured()} tz={tz} />

          <section className="card p-5">
            <h2 className="h2 mb-3">Commitment timeline</h2>
            {commitment.length === 0 ? <p className="muted">No confirmations or concerns yet.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {commitment.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap py-1 pr-3 text-xs text-zinc-500">{fmtDate(e.createdAt, { year: undefined, timeZone: tz })}</td>
                      <td className="py-1">{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {resolved.length > 0 && <p className="mt-3 text-xs text-zinc-500">{resolved.length} resolved concern{resolved.length > 1 ? "s" : ""}</p>}
          </section>

          <details className="card p-5">
            <summary className="h2 cursor-pointer">Candidate details</summary>
            <form action={updateCandidateDetails.bind(null, c.id)} className="mt-3 space-y-2">
              <div><label className="label">Email</label><input name="email" defaultValue={c.email ?? ""} className="input" /></div>
              <div><label className="label">Phone</label><input name="phone" defaultValue={c.phone ?? ""} className="input" /></div>
              <div><label className="label">Preferred channel</label>
                <select name="preferredChannel" defaultValue={c.preferredChannel} className="input"><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="sms">SMS</option></select>
              </div>
              <div><label className="label">Position</label><input name="position" defaultValue={c.position} className="input" /></div>
              <div><label className="label">Department</label><input name="department" defaultValue={c.department ?? ""} className="input" /></div>
              <div><label className="label">Location</label><input name="location" defaultValue={c.location ?? ""} className="input" /></div>
              <div><label className="label">Hiring manager</label><input name="hiringManagerName" defaultValue={c.hiringManagerName ?? ""} className="input" /></div>
              <div><label className="label">Hiring manager email</label><input name="hiringManagerEmail" type="email" defaultValue={c.hiringManagerEmail ?? ""} className="input" /></div>
              <div><label className="label">Language</label>
                <select name="language" defaultValue={c.language} className="input">{Object.entries(LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </div>
              <div><label className="label">First-day time</label><input name="firstDayTime" defaultValue={c.firstDayTime ?? ""} placeholder={user.org.firstDayTime} className="input" /></div>
              <div><label className="label">First-day address</label><input name="firstDayAddress" defaultValue={c.firstDayAddress ?? ""} placeholder={user.org.firstDayAddress ?? ""} className="input" /></div>
              <div><label className="label">First-day notes</label><textarea name="firstDayNotes" rows={2} defaultValue={c.firstDayNotes ?? ""} placeholder={user.org.firstDayNotes ?? "What to bring, who to ask for"} className="input" /></div>
              <label className="flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" name="voiceConsent" defaultChecked={Boolean(c.voiceConsentAt)} /> Candidate agreed to AI voice check-in calls</label>
              <div><label className="label">Recruiter</label>
                <select name="recruiterId" defaultValue={c.recruiterId ?? ""} className="input">{recruiters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              </div>
              <SubmitButton className="btn-secondary w-full">Save</SubmitButton>
            </form>
          </details>

          <section className="card p-5">
            <h2 className="h2 mb-3">Activity</h2>
            <ul className="space-y-2">
              {c.events.map((e) => (
                <li key={e.id} className="flex gap-2 text-xs">
                  <Avatar name={e.actor === "ai" ? "A I" : e.actor} size={18} />
                  <div><span className="text-zinc-700">{e.detail}</span><div className="text-zinc-400">{fmtDateTime(e.createdAt, tz)} · {e.actor}</div></div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
