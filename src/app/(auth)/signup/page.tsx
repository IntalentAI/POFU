"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signup } from "../actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="h2 text-base">Create your workspace</h1>
        <p className="muted">Free to start. No credit card required.</p>
      </div>
      <div><label className="label" htmlFor="company">Company</label><input id="company" name="company" required className="input" /></div>
      <div><label className="label" htmlFor="name">Your name</label><input id="name" name="name" required className="input" /></div>
      <div><label className="label" htmlFor="email">Work email</label><input id="email" name="email" type="email" required className="input" /></div>
      <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" minLength={8} required className="input" /></div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating…" : "Create workspace"}</button>
      <p className="muted text-center">Already have an account? <Link href="/login" className="text-brand-600 hover:underline">Sign in</Link></p>
    </form>
  );
}
