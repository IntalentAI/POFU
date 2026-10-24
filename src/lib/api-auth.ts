import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "./db";

/** Resolve the organization for an integration API request (Authorization: Bearer <api key>). */
export async function authenticateApi(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const key = await db.apiKey.findUnique({
    where: { keyHash: crypto.createHash("sha256").update(token).digest("hex") },
    include: { org: true },
  });
  if (!key) return null;
  await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return key.org;
}

export const unauthorized = () => NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
export const badRequest = (error: string, details?: unknown) => NextResponse.json({ error, details }, { status: 400 });

/** Find the candidate a channel message belongs to (most recent active match). */
export async function findCandidateByContact(contact: { phone?: string; email?: string }) {
  const status = { in: ["pre_joining", "joined"] };
  if (contact.email) {
    return db.candidate.findFirst({ where: { email: contact.email.toLowerCase(), status }, orderBy: { offerAcceptedAt: "desc" } });
  }
  const digits = (contact.phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  const tail = digits.slice(-10);
  const rows = await db.candidate.findMany({ where: { phone: { not: null }, status }, orderBy: { offerAcceptedAt: "desc" } });
  return rows.find((c) => c.phone!.replace(/\D/g, "").endsWith(tail)) ?? null;
}
