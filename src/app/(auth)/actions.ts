"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createWorkspace } from "@/lib/onboarding";

export type AuthState = { error?: string } | undefined;

export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") || "").toLowerCase().trim();
  const password = String(form.get("password") || "");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return { error: "Incorrect email or password." };
  await createSession(user.id);
  redirect("/dashboard");
}

export async function signup(_: AuthState, form: FormData): Promise<AuthState> {
  const company = String(form.get("company") || "").trim();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").toLowerCase().trim();
  const password = String(form.get("password") || "");
  if (!company || !name || !email) return { error: "Please fill in every field." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with this email already exists." };
  const user = await createWorkspace({ company, name, email, password, timezone: String(form.get("timezone") || "") });
  await createSession(user.id);
  redirect("/dashboard?welcome=1");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
