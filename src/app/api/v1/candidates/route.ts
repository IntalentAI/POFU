import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApi, badRequest, unauthorized } from "@/lib/api-auth";
import { serializeCandidate } from "@/lib/api-serialize";
import { db } from "@/lib/db";
import { daysBetween, parseDateOnly } from "@/lib/dates";
import { enrollCandidate } from "@/lib/engine/actions";
import { runDueEngagements } from "@/lib/engine/dispatcher";

const dateStr = z.string().refine((s) => parseDateOnly(s) !== null, "Expected YYYY-MM-DD");

const EnrollSchema = z.object({
  externalId: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  preferredChannel: z.enum(["whatsapp", "email", "sms"]).optional(),
  language: z.string().optional(),
  position: z.string().min(1),
  department: z.string().optional(),
  location: z.string().optional(),
  hiringManagerName: z.string().optional(),
  hiringManagerEmail: z.string().email().optional(),
  recruiterEmail: z.string().email().optional(),
  offerAcceptedAt: dateStr.optional(),
  joiningDate: dateStr,
}).refine((v) => v.email || v.phone, "email or phone is required");

export async function GET(req: Request) {
  const org = await authenticateApi(req);
  if (!org) return unauthorized();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const readiness = url.searchParams.get("readiness") ?? undefined;
  const rows = await db.candidate.findMany({
    where: { orgId: org.id, status, readiness }, include: { concerns: true }, orderBy: { joiningDate: "asc" }, take: 500,
  });
  return NextResponse.json({ data: rows.map(serializeCandidate) });
}

/** Enroll a candidate whose offer was accepted. Idempotent on externalId. */
export async function POST(req: Request) {
  const org = await authenticateApi(req);
  if (!org) return unauthorized();
  const parsed = EnrollSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid request body", parsed.error.issues);
  const b = parsed.data;
  if (b.externalId) {
    const existing = await db.candidate.findFirst({ where: { orgId: org.id, externalId: b.externalId }, include: { concerns: true } });
    if (existing) return NextResponse.json({ data: serializeCandidate(existing), created: false });
  }
  const recruiter = b.recruiterEmail ? await db.user.findFirst({ where: { orgId: org.id, email: b.recruiterEmail.toLowerCase() } }) : null;
  const accepted = b.offerAcceptedAt ? parseDateOnly(b.offerAcceptedAt)! : null;
  const c = await enrollCandidate(org, {
    ...b, recruiterId: recruiter?.id ?? null, source: "api",
    offerAcceptedAt: !accepted || daysBetween(accepted, new Date()) <= 0 ? new Date() : accepted,
    joiningDate: parseDateOnly(b.joiningDate)!,
  }, "api");
  await runDueEngagements();
  const fresh = await db.candidate.findUniqueOrThrow({ where: { id: c.id }, include: { concerns: true } });
  return NextResponse.json({ data: serializeCandidate(fresh), created: true }, { status: 201 });
}
