import { NextResponse } from "next/server";
import { authenticateApi, unauthorized } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { onboardingPayload } from "@/lib/checklist";

/**
 * Onboarding handoff package for an HRIS/HCM: profile, checklist status and signed
 * document links (valid 24 hours). The same payload is pushed as the
 * `candidate.ready_for_onboarding` webhook once every required item is verified.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const org = await authenticateApi(req);
  if (!org) return unauthorized();
  const { id } = await params;
  const c = await db.candidate.findFirst({
    where: { orgId: org.id, OR: [{ id }, { externalId: id }] },
    include: { checklist: { orderBy: { position: "asc" } }, documents: true, recruiter: { select: { name: true, email: true } } },
  });
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: { ...onboardingPayload(c), readyForOnboarding: Boolean(c.onboardingReadyAt), readyAt: c.onboardingReadyAt } });
}
