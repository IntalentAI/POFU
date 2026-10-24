"use client";
import { useActionState } from "react";
import { createCandidate } from "../../actions";

type Props = {
  recruiters: { id: string; name: string }[]; campaigns: { id: string; name: string }[];
  currentUserId: string; defaultChannel: string; today: string; defaultJoining: string;
};

export function NewCandidateForm(p: Props) {
  const [state, action, pending] = useActionState(createCandidate, undefined);
  return (
    <form action={action} className="card space-y-6 p-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="h2 mb-3">Candidate</legend>
        <div><label className="label">First name *</label><input name="firstName" required className="input" /></div>
        <div><label className="label">Last name</label><input name="lastName" className="input" /></div>
        <div><label className="label">Email</label><input name="email" type="email" className="input" /></div>
        <div><label className="label">Mobile (WhatsApp / SMS)</label><input name="phone" placeholder="+14155550123" className="input" /></div>
        <div><label className="label">Preferred channel</label>
          <select name="preferredChannel" defaultValue={p.defaultChannel} className="input">
            <option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="sms">SMS</option>
          </select>
        </div>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="h2 mb-3">Offer</legend>
        <div><label className="label">Position *</label><input name="position" required className="input" /></div>
        <div><label className="label">Department</label><input name="department" className="input" /></div>
        <div><label className="label">Work location</label><input name="location" placeholder="San Francisco HQ" className="input" /></div>
        <div><label className="label">Hiring manager</label><input name="hiringManagerName" className="input" /></div>
        <div><label className="label">Offer accepted on</label><input name="offerAcceptedAt" type="date" defaultValue={p.today} max={p.today} className="input" /></div>
        <div><label className="label">Joining date *</label><input name="joiningDate" type="date" required defaultValue={p.defaultJoining} min={p.today} className="input" /></div>
        <div><label className="label">Recruiter</label>
          <select name="recruiterId" defaultValue={p.currentUserId} className="input">
            {p.recruiters.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div><label className="label">Engagement journey</label>
          <select name="campaignId" className="input">
            {p.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </fieldset>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{pending ? "Enrolling…" : "Enroll candidate"}</button></div>
    </form>
  );
}
