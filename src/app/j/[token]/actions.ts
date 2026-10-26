"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { raiseConcern } from "@/lib/engine/actions";
import { handleInboundMessage } from "@/lib/engine/inbound";
import { deliverToCandidate } from "@/lib/engine/outbound";
import { evaluateReadiness } from "@/lib/engine/readiness";
import { checkOnboardingReady } from "@/lib/checklist";
import { logEvent } from "@/lib/events";

export async function sendFromPortal(token: string, f: FormData) {
  const body = String(f.get("body") ?? "").trim().slice(0, 2000);
  const candidate = await db.candidate.findUnique({ where: { portalToken: token } });
  if (!candidate || !body) return;
  await handleInboundMessage(candidate.id, body, "web");
  revalidatePath(`/j/${token}`);
}

export async function requestHuman(token: string) {
  const candidate = await db.candidate.findUnique({ where: { portalToken: token }, include: { org: true, recruiter: true } });
  if (!candidate) return;
  await raiseConcern(candidate, "other", "Asked to speak with a person", { actor: "candidate" });
  await deliverToCandidate({
    candidate, org: candidate.org, author: "ai", channel: "web",
    body: `Of course. I've asked ${candidate.recruiter?.name ?? "your recruiter"} to get in touch with you directly${candidate.recruiter ? ` (${candidate.recruiter.email})` : ""}.`,
  });
  await evaluateReadiness(candidate.id);
  revalidatePath(`/j/${token}`);
}

/** Candidate confirms an item that needs no upload (e.g. "First-day instructions reviewed"). */
export async function acknowledgeItem(token: string, itemId: string) {
  const candidate = await db.candidate.findUnique({ where: { portalToken: token } });
  if (!candidate) return;
  const item = await db.checklistItem.findFirst({ where: { id: itemId, candidateId: candidate.id, allowUpload: false, category: { not: "background" } } });
  if (!item || item.status === "verified") return;
  await db.checklistItem.update({ where: { id: item.id }, data: { status: "verified", submittedAt: new Date(), reviewedAt: new Date(), reviewedBy: "Candidate" } });
  await logEvent(candidate.id, "document_submitted", `Confirmed: ${item.title}`, "candidate");
  await checkOnboardingReady(candidate.id);
  await evaluateReadiness(candidate.id);
  revalidatePath(`/j/${token}`);
}

/** Candidate opts in or out of AI voice check-in calls (brief §12: consent, can decline). */
export async function setVoiceConsent(token: string, consent: boolean) {
  const candidate = await db.candidate.findUnique({ where: { portalToken: token } });
  if (!candidate) return;
  await db.candidate.update({ where: { id: candidate.id }, data: { voiceConsentAt: consent ? new Date() : null } });
  await logEvent(candidate.id, "voice_consent", consent ? "Agreed to AI voice check-in calls" : "Withdrew consent for AI voice check-in calls", "candidate");
  revalidatePath(`/j/${token}`);
}
