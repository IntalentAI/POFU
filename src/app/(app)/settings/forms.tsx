"use client";
import { useActionState } from "react";
import { createApiKey, inviteTeammate } from "../actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteTeammate, undefined);
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input name="name" placeholder="Name" required className="input w-40" />
      <input name="email" type="email" placeholder="Email" required className="input min-w-52 flex-1" />
      <select name="role" className="input w-40"><option value="recruiter">Recruiter</option><option value="hiring_manager">Hiring manager</option><option value="admin">Admin</option></select>
      <button className="btn-secondary" disabled={pending}>Add</button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="w-full text-sm text-emerald-700">{state.ok}</p>}
    </form>
  );
}

export function ApiKeyForm() {
  const [state, action, pending] = useActionState(createApiKey, undefined);
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input name="name" placeholder="Key name, e.g. Greenhouse integration" className="input min-w-64 flex-1" />
      <button className="btn-secondary" disabled={pending}>Create API key</button>
      {state?.ok && (
        <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          Copy this key now — it won&apos;t be shown again:<br /><code className="break-all font-mono text-xs">{state.ok}</code>
        </div>
      )}
    </form>
  );
}
