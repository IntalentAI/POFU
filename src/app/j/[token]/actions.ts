"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { raiseConcern } from "@/lib/engine/actions";
import { handleInboundMessage } from "@/lib/engine/inbound";
import { deliverToCandidate } from "@/lib/engine/outbound";
import { evaluateReadiness } from "@/lib/engine/readiness";

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
