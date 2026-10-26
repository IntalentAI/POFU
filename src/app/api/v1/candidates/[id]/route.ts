import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApi, badRequest, unauthorized } from "@/lib/api-auth";
import { serializeCandidate } from "@/lib/api-serialize";
import { db } from "@/lib/db";
import { parseDateOnly } from "@/lib/dates";
import { changeJoiningDate, setCandidateStatus } from "@/lib/engine/actions";
import { checkOnboardingReady } from "@/lib/checklist";
import { evaluateReadiness } from "@/lib/engine/readiness";
import { logEvent } from "@/lib/events";

async function find(orgId: string, id: string) {
  return db.candidate.findFirst({ where: { orgId, OR: [{ id }, { externalId: id }] }, include: { concerns: true, checklist: { orderBy: { position: "asc" } } } });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const org = await authenticateApi(req);
  if (!org) return unauthorized();
  const c = await find(org.id, (await params).id);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: serializeCandidate(c) });
}

const PatchSchema = z.object({
  joiningDate: z.string().optional(),
  notifyCandidate: z.boolean().optional(),
  status: z.enum(["joined", "dropped", "offer_rescinded", "pre_joining"]).optional(),
  reason: z.string().optional(),
  // e.g. a background-verification vendor or HRIS reporting progress on checklist items
  checklist: z.array(z.object({
    id: z.string().optional(), title: z.string().optional(),
    status: z.enum(["pending", "submitted", "verified", "rejected", "waived"]), note: z.string().optional(),
  }).refine((u) => u.id || u.title, "id or title is required")).optional(),
});

/** Sync changes from the ATS/HRIS: joining date moves, joins, withdrawals, rescinded offers. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const org = await authenticateApi(req);
  if (!org) return unauthorized();
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid request body", parsed.error.issues);
  let c = await find(org.id, (await params).id);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (parsed.data.joiningDate) {
    const d = parseDateOnly(parsed.data.joiningDate);
    if (!d) return badRequest("joiningDate must be YYYY-MM-DD");
    await changeJoiningDate(c, org, d, { actor: "api", notify: parsed.data.notifyCandidate ?? false, reason: parsed.data.reason });
  }
  if (parsed.data.status && parsed.data.status !== c.status) {
    await setCandidateStatus(c, parsed.data.status, { actor: "api", reason: parsed.data.reason });
  }
  for (const u of parsed.data.checklist ?? []) {
    const item = c.checklist.find((i) => i.id === u.id || (u.title && i.title.toLowerCase() === u.title.toLowerCase()));
    if (!item) return badRequest(`Checklist item not found: ${u.id ?? u.title}`);
    await db.checklistItem.update({
      where: { id: item.id },
      data: { status: u.status, note: u.note ?? null, reviewedAt: new Date(), reviewedBy: "Integration", ...(u.status === "submitted" ? { submittedAt: new Date() } : {}) },
    });
    await logEvent(c.id, "document_reviewed", `${item.title}: ${u.status} (via API)${u.note ? ` — ${u.note}` : ""}`, "api");
  }
  if (parsed.data.checklist?.length) {
    await checkOnboardingReady(c.id);
    await evaluateReadiness(c.id);
  }
  c = (await find(org.id, c.id))!;
  return NextResponse.json({ data: serializeCandidate(c) });
}
