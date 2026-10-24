"use client";
import { useActionState } from "react";
import Link from "next/link";
import { importCsv } from "../../actions";

const SAMPLE = `first_name,last_name,email,phone,channel,position,department,location,hiring_manager,offer_accepted_date,joining_date,recruiter_email,external_id
Jamie,Rivera,jamie@example.com,+14155550142,whatsapp,Support Engineer,Customer Success,Austin Office,Luis Ortega,2026-10-20,2026-12-01,,ATS-1042`;

export default function ImportPage() {
  const [state, action, pending] = useActionState(importCsv, undefined);
  return (
    <div className="max-w-3xl">
      <h1 className="h1">Import accepted offers</h1>
      <p className="muted mb-6">Upload a CSV exported from your ATS. Each row is enrolled and receives a welcome message.</p>
      <form action={action} className="card space-y-4 p-6">
        <div><label className="label">CSV file</label><input type="file" name="file" accept=".csv,text/csv" className="input" /></div>
        <div><label className="label">…or paste CSV</label><textarea name="csv" rows={6} className="input font-mono text-xs" placeholder={SAMPLE} /></div>
        <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
          <div className="mb-1 font-medium">Columns</div>
          Required: <code>first_name</code>, <code>position</code>, <code>joining_date</code> (YYYY-MM-DD), and <code>email</code> or <code>phone</code>.<br />
          Optional: <code>last_name, channel (whatsapp|email|sms), department, location, hiring_manager, offer_accepted_date, recruiter_email, external_id</code>.
          <pre className="mt-2 overflow-x-auto whitespace-pre text-[11px]">{SAMPLE}</pre>
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.ok && <p className="text-sm text-emerald-700">{state.ok} <Link href="/candidates" className="underline">View candidates</Link></p>}
        <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{pending ? "Importing…" : "Import"}</button></div>
      </form>
    </div>
  );
}
