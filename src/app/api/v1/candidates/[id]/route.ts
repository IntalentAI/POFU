import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApi, badRequest, unauthorized } from "@/lib/api-auth";
import { serializeCandidate } from "@/lib/api-serialize";
import { db } from "@/lib/db";
import { parseDateOnly } from "@/lib/dates";
import { changeJoiningDate, setCandidateStatus } from "@/lib/engine/actions";

async function find(orgId: string, id: string) {
  return db.candidate.findFirst({ where: { orgId, OR: [{ id }, { externalId: id }] }, include: { concerns: true } });
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
  c = (await find(org.id, c.id))!;
  return NextResponse.json({ data: serializeCandidate(c) });
}
