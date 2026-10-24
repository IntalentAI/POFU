"use client";
import Link from "next/link";
import { useActionState } from "react";
import { login } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <h1 className="h2 text-base">Sign in</h1>
      <div>
        <label className="label" htmlFor="email">Work email</label>
        <input id="email" name="email" type="email" required className="input" defaultValue="demo@acme.test" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required className="input" defaultValue="demo1234" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="muted text-center">New here? <Link href="/signup" className="text-brand-600 hover:underline">Start free</Link></p>
      <p className="text-center text-xs text-zinc-400">Demo workspace: demo@acme.test / demo1234</p>
    </form>
  );
}
