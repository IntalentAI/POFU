"use server";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CHANNELS, type ConcernCategory } from "@/lib/constants";
import { db } from "@/lib/db";
import { daysBetween, parseDateOnly } from "@/lib/dates";
import { changeJoiningDate, enrollCandidate, raiseConcern, resolveConcern, setCandidateStatus, setEngagementPaused } from "@/lib/engine/actions";
import { runDueEngagements } from "@/lib/engine/dispatcher";
import { handleInboundMessage } from "@/lib/engine/inbound";
import { deliverToCandidate } from "@/lib/engine/outbound";
import { evaluateReadiness } from "@/lib/engine/readiness";
import { rebuildSchedule } from "@/lib/engine/schedule";
import { logEvent } from "@/lib/events";
import { parseCsv } from "@/lib/csv";
import { checkOnboardingReady, createCandidateChecklist } from "@/lib/checklist";
import { requestWelcome } from "@/lib/engine/welcome";
import { finishCall, startVoiceCall, voiceTurn } from "@/lib/engine/voice";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function ownCandidate(id: string) {
  const user = await requireUser();
  const candidate = await db.candidate.findFirst({ where: { id, orgId: user.orgId } });
  if (!candidate) throw new Error("Candidate not found");
  return { user, org: user.org, candidate };
}

function refresh(candidateId?: string) {
  if (candidateId) revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/dashboard");
  revalidatePath("/candidates");
}

// ---- Candidates ----

export type FormState = { error?: string; ok?: string } | undefined;

export async function createCandidate(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const joiningDate = parseDateOnly(str(f, "joiningDate"));
  const accepted = parseDateOnly(str(f, "offerAcceptedAt"));
  if (!str(f, "firstName") || !str(f, "position") || !joiningDate) return { error: "First name, position and joining date are required." };
  if (!str(f, "email") && !str(f, "phone")) return { error: "Add an email or a phone number so the companion can reach the candidate." };
  const channel = str(f, "preferredChannel");
  const c = await enrollCandidate(user.org, {
    firstName: str(f, "firstName"), lastName: str(f, "lastName"), email: str(f, "email"), phone: str(f, "phone"),
    preferredChannel: (CHANNELS as readonly string[]).includes(channel) ? channel : undefined,
    position: str(f, "position"), department: str(f, "department"), location: str(f, "location"),
    hiringManagerName: str(f, "hiringManagerName"), hiringManagerEmail: str(f, "hiringManagerEmail"),
    recruiterId: str(f, "recruiterId") || user.id, campaignId: str(f, "campaignId") || null,
    // Accepted today (or no date given): use the current time so the welcome goes out now.
    offerAcceptedAt: !accepted || daysBetween(accepted, new Date()) <= 0 ? new Date() : accepted,
    joiningDate,
  }, user.name);
  await runDueEngagements(); // send the welcome right away
  redirect(`/candidates/${c.id}`);
}

export async function importCsv(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const file = f.get("file");
  const text = file instanceof File && file.size ? await file.text() : str(f, "csv");
  if (!text) return { error: "Choose a CSV file or paste CSV text." };
  const rows = parseCsv(text);
  const recruiters = await db.user.findMany({ where: { orgId: user.orgId } });
  let created = 0;
  const errors: string[] = [];
  for (const [i, r] of rows.entries()) {
    const joiningDate = parseDateOnly(r.joining_date ?? r.joiningdate ?? "");
    const firstName = r.first_name ?? r.firstname ?? (r.name ?? "").split(" ")[0];
    if (!firstName || !r.position || !joiningDate) { errors.push(`Row ${i + 2}: needs first_name, position and joining_date (YYYY-MM-DD)`); continue; }
    if (r.external_id && (await db.candidate.findFirst({ where: { orgId: user.orgId, externalId: r.external_id } }))) { errors.push(`Row ${i + 2}: ${r.external_id} already imported`); continue; }
    const recruiter = recruiters.find((u) => u.email === r.recruiter_email?.toLowerCase());
    await enrollCandidate(user.org, {
      firstName, lastName: r.last_name ?? r.lastname ?? (r.name ?? "").split(" ").slice(1).join(" "),
      email: r.email, phone: r.phone, preferredChannel: (CHANNELS as readonly string[]).includes(r.channel) ? r.channel : undefined,
      position: r.position, department: r.department, location: r.location,
      hiringManagerName: r.hiring_manager, hiringManagerEmail: r.hiring_manager_email,
      recruiterId: recruiter?.id ?? user.id, externalId: r.external_id || null, source: "csv",
      offerAcceptedAt: parseDateOnly(r.offer_accepted_date ?? "") ?? new Date(), joiningDate,
    }, user.name);
    created++;
  }
  await runDueEngagements();
  revalidatePath("/candidates");
  return { ok: `Imported ${created} candidate${created === 1 ? "" : "s"}.${errors.length ? ` Skipped ${errors.length}: ${errors.slice(0, 3).join("; ")}` : ""}`, error: created === 0 && errors.length ? errors.slice(0, 5).join("; ") : undefined };
}

export async function updateCandidateDetails(id: string, f: FormData) {
  const { user, candidate } = await ownCandidate(id);
  await db.candidate.update({
    where: { id: candidate.id },
    data: {
      email: str(f, "email") || null, phone: str(f, "phone") || null, preferredChannel: str(f, "preferredChannel") || candidate.preferredChannel,
      position: str(f, "position") || candidate.position, location: str(f, "location") || null, department: str(f, "department") || null,
      hiringManagerName: str(f, "hiringManagerName") || null, hiringManagerEmail: str(f, "hiringManagerEmail") || null,
      recruiterId: str(f, "recruiterId") || candidate.recruiterId, language: str(f, "language") || candidate.language,
      firstDayTime: str(f, "firstDayTime") || null, firstDayAddress: str(f, "firstDayAddress") || null, firstDayNotes: str(f, "firstDayNotes") || null,
      // A recruiter can record consent the candidate gave verbally (e.g. on a call).
      voiceConsentAt: f.get("voiceConsent") === "on" ? candidate.voiceConsentAt ?? new Date() : null,
    },
  });
  await logEvent(candidate.id, "updated", "Candidate details updated", user.name);
  refresh(id);
}

export async function changeDate(id: string, f: FormData) {
  const { user, org, candidate } = await ownCandidate(id);
  const date = parseDateOnly(str(f, "joiningDate"));
  if (!date) return;
  await changeJoiningDate(candidate, org, date, { actor: user.name, notify: f.get("notify") === "on", reason: str(f, "reason") || undefined });
  const concernId = str(f, "concernId");
  if (concernId) await resolveConcern(concernId, `New joining date approved`, user.name);
  refresh(id);
}

export async function markStatus(id: string, status: "joined" | "dropped" | "offer_rescinded" | "pre_joining", f?: FormData) {
  const { user, candidate } = await ownCandidate(id);
  await setCandidateStatus(candidate, status, { actor: user.name, reason: f ? str(f, "reason") || undefined : undefined });
  refresh(id);
}

export async function togglePause(id: string) {
  const { user, candidate } = await ownCandidate(id);
  await setEngagementPaused(candidate, !candidate.engagementPaused, user.name);
  refresh(id);
}

export async function sendRecruiterMessage(id: string, f: FormData) {
  const { user, org, candidate } = await ownCandidate(id);
  const body = str(f, "body");
  if (!body) return;
  await deliverToCandidate({ candidate, org, body, author: "recruiter", authorName: user.name, subject: `A message from ${user.name}` });
  await logEvent(candidate.id, "recruiter_message", "Recruiter sent a message", user.name);
  refresh(id);
}

/** Lets a recruiter test the agent: simulate the candidate replying on their channel. */
export async function simulateCandidateReply(id: string, f: FormData) {
  const { candidate } = await ownCandidate(id);
  const body = str(f, "body");
  if (!body) return;
  await handleInboundMessage(candidate.id, body, (candidate.preferredChannel as "whatsapp" | "email" | "sms") ?? "whatsapp");
  refresh(id);
}

export async function addConcernManually(id: string, f: FormData) {
  const { user, candidate } = await ownCandidate(id);
  await raiseConcern(candidate, (str(f, "category") || "other") as ConcernCategory, str(f, "summary") || "Recruiter recorded a concern", { actor: user.name });
  await evaluateReadiness(candidate.id);
  refresh(id);
}

export async function resolveConcernAction(concernId: string, f: FormData) {
  const user = await requireUser();
  const concern = await db.concern.findFirst({ where: { id: concernId, orgId: user.orgId } });
  if (!concern) return;
  // Unanswered questions: answer the candidate directly and optionally teach the companion.
  const answer = str(f, "answer");
  if (answer) {
    const candidate = await db.candidate.findUniqueOrThrow({ where: { id: concern.candidateId } });
    await deliverToCandidate({ candidate, org: user.org, body: answer, author: "recruiter", authorName: user.name, subject: `An answer from ${user.name}` });
    const question = /Asked: "(.*)"/.exec(concern.summary)?.[1] ?? str(f, "question");
    if (f.get("saveToKnowledge") === "on" && question) {
      await db.knowledgeItem.create({ data: { orgId: user.orgId, question, answer, category: str(f, "category") || "General" } });
      await logEvent(candidate.id, "knowledge_added", `Added "${question.slice(0, 80)}" to approved answers`, user.name);
    }
  }
  await resolveConcern(concernId, str(f, "resolution") || (answer ? "Answered by recruiter" : ""), user.name);
  refresh(concern.candidateId);
}

// ---- Documentation checklist ----

export async function reviewChecklistItem(itemId: string, status: "verified" | "rejected" | "waived" | "pending", f?: FormData) {
  const user = await requireUser();
  const item = await db.checklistItem.findFirst({ where: { id: itemId, candidate: { orgId: user.orgId } }, include: { candidate: true } });
  if (!item) return;
  const note = f ? str(f, "note") : "";
  await db.checklistItem.update({
    where: { id: item.id },
    data: { status, note: note || null, reviewedAt: status === "pending" ? null : new Date(), reviewedBy: status === "pending" ? null : user.name },
  });
  const verb = { verified: "Verified", rejected: "Asked for a new upload of", waived: "Marked not required:", pending: "Reopened" }[status];
  await logEvent(item.candidateId, "document_reviewed", `${verb} ${item.title}${note ? ` (${note})` : ""}`, user.name);
  if (status === "rejected" && item.candidate.status === "pre_joining") {
    await deliverToCandidate({
      candidate: item.candidate, org: user.org, author: "ai", subject: `${item.title}: please upload again`,
      body: `Hi ${item.candidate.firstName}, your ${item.title.toLowerCase()} needs another look${note ? `: ${note}` : "."} Please upload a new copy on your joining page: ${(process.env.APP_URL || "").replace(/\/$/, "")}/j/${item.candidate.portalToken}`,
    });
  }
  await checkOnboardingReady(item.candidateId);
  await evaluateReadiness(item.candidateId);
  refresh(item.candidateId);
}

export async function addChecklistItem(id: string, f: FormData) {
  const { user, candidate } = await ownCandidate(id);
  const title = str(f, "title");
  if (!title) return;
  const count = await db.checklistItem.count({ where: { candidateId: candidate.id } });
  await db.checklistItem.create({
    data: {
      candidateId: candidate.id, title, description: str(f, "description") || null, required: f.get("required") === "on",
      allowUpload: f.get("allowUpload") === "on", position: count, dueDate: parseDateOnly(str(f, "dueDate")) ?? null,
    },
  });
  await logEvent(candidate.id, "checklist_updated", `Added checklist item: ${title}`, user.name);
  await checkOnboardingReady(candidate.id);
  await evaluateReadiness(candidate.id);
  refresh(id);
}

export async function applyStandardChecklist(id: string) {
  const { user, candidate } = await ownCandidate(id);
  if (await db.checklistItem.count({ where: { candidateId: candidate.id } })) return;
  await createCandidateChecklist(candidate);
  await logEvent(candidate.id, "checklist_updated", "Applied the standard documentation checklist", user.name);
  await evaluateReadiness(candidate.id);
  refresh(id);
}

// ---- Hiring manager welcome & voice ----

export async function requestWelcomeAction(id: string) {
  const { user, org, candidate } = await ownCandidate(id);
  const existing = await db.welcomeMessage.findFirst({ where: { candidateId: candidate.id, status: "requested" } });
  await requestWelcome(candidate, org, { actor: user.name, reminder: Boolean(existing) });
  refresh(id);
}

export async function startVoiceCallAction(id: string) {
  const { user, candidate } = await ownCandidate(id);
  const r = await startVoiceCall(candidate.id, user.name);
  if (!r.ok) await logEvent(candidate.id, "voice_call", `Voice check-in not started: ${r.reason}`, user.name);
  refresh(id);
  if (r.simulated && r.callId) redirect(`/candidates/${id}/call/${r.callId}`);
}

async function ownSimulatedCall(callId: string) {
  const user = await requireUser();
  const call = await db.voiceCall.findFirst({ where: { id: callId, provider: "simulator", candidate: { orgId: user.orgId } } });
  if (!call) throw new Error("Call not found");
  return call;
}

/** Simulator: the recruiter types what the candidate would say on the call. */
export async function simulateVoiceTurn(callId: string, f: FormData) {
  const call = await ownSimulatedCall(callId);
  if (call.endedAt) return;
  await voiceTurn(callId, str(f, "speech"));
  revalidatePath(`/candidates/${call.candidateId}/call/${callId}`);
  refresh(call.candidateId);
}

export async function endSimulatedCall(callId: string) {
  const call = await ownSimulatedCall(callId);
  await finishCall(callId, "completed");
  refresh(call.candidateId);
  redirect(`/candidates/${call.candidateId}`);
}

export async function rebuildCandidateSchedule(id: string) {
  const { user, org, candidate } = await ownCandidate(id);
  await rebuildSchedule(candidate, org);
  await logEvent(candidate.id, "schedule_rebuilt", "Engagement schedule rebuilt", user.name);
  refresh(id);
}

export async function runSchedulerNow() {
  await requireUser();
  await runDueEngagements(new Date(), { sweepReadiness: true });
  revalidatePath("/", "layout");
}

// ---- Campaigns ----

export async function saveStep(campaignId: string, stepId: string | null, f: FormData) {
  const user = await requireUser();
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, orgId: user.orgId }, include: { steps: true } });
  if (!campaign) return;
  const data = {
    name: str(f, "name"), objective: str(f, "objective") || null, anchor: str(f, "anchor"), offset: Number(str(f, "offset")) || 0,
    kind: str(f, "kind") || "message", optional: f.get("optional") === "on", subject: str(f, "subject") || null, body: str(f, "body"),
  };
  if (stepId) await db.campaignStep.update({ where: { id: stepId }, data });
  else await db.campaignStep.create({ data: { ...data, campaignId, key: `custom_${crypto.randomBytes(3).toString("hex")}`, position: campaign.steps.length } });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function deleteStep(campaignId: string, stepId: string) {
  const user = await requireUser();
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, orgId: user.orgId } });
  if (!campaign) return;
  await db.campaignStep.delete({ where: { id: stepId } });
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function duplicateCampaign(campaignId: string) {
  const user = await requireUser();
  const src = await db.campaign.findFirst({ where: { id: campaignId, orgId: user.orgId }, include: { steps: true } });
  if (!src) return;
  const copy = await db.campaign.create({
    data: {
      orgId: user.orgId, name: `${src.name} (copy)`, description: src.description,
      steps: { create: src.steps.map((s) => ({ key: s.key, name: s.name, objective: s.objective, anchor: s.anchor, offset: s.offset, kind: s.kind, optional: s.optional, subject: s.subject, body: s.body, position: s.position })) },
    },
  });
  redirect(`/campaigns/${copy.id}`);
}

export async function updateCampaignMeta(campaignId: string, f: FormData) {
  const user = await requireUser();
  const campaign = await db.campaign.findFirst({ where: { id: campaignId, orgId: user.orgId } });
  if (!campaign) return;
  if (f.get("isDefault") === "on") await db.campaign.updateMany({ where: { orgId: user.orgId }, data: { isDefault: false } });
  await db.campaign.update({ where: { id: campaignId }, data: { name: str(f, "name") || campaign.name, description: str(f, "description") || null, isDefault: f.get("isDefault") === "on" || campaign.isDefault } });
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

// ---- Settings ----

export async function updateOrgSettings(f: FormData) {
  const user = await requireUser();
  const int = (k: string, d: number) => { const n = Number(str(f, k)); return Number.isFinite(n) && n >= 0 && n <= 23 ? n : d; };
  const tz = str(f, "timezone");
  let timezone = user.org.timezone;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); timezone = tz; } catch {}
  await db.organization.update({
    where: { id: user.orgId },
    data: {
      name: str(f, "name") || user.org.name, companionName: str(f, "companionName") || user.org.companionName,
      defaultChannel: str(f, "defaultChannel") || user.org.defaultChannel, timezone,
      // Quiet hours off = same start and end hour (never quiet).
      quietHoursStart: f.get("quietHoursEnabled") === "on" ? int("quietHoursStart", 21) : 0,
      quietHoursEnd: f.get("quietHoursEnabled") === "on" ? int("quietHoursEnd", 9) : 0,
      sendHour: int("sendHour", user.org.sendHour),
      firstDayTime: str(f, "firstDayTime") || user.org.firstDayTime,
      firstDayAddress: str(f, "firstDayAddress") || null, firstDayNotes: str(f, "firstDayNotes") || null,
    },
  });
  revalidatePath("/settings");
}

export async function addKnowledge(f: FormData) {
  const user = await requireUser();
  if (!str(f, "question") || !str(f, "answer")) return;
  await db.knowledgeItem.create({ data: { orgId: user.orgId, question: str(f, "question"), answer: str(f, "answer"), category: str(f, "category") || "General" } });
  revalidatePath("/settings");
}

export async function deleteKnowledge(id: string) {
  const user = await requireUser();
  await db.knowledgeItem.deleteMany({ where: { id, orgId: user.orgId } });
  revalidatePath("/settings");
}

export async function inviteTeammate(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const email = str(f, "email").toLowerCase();
  if (!email || !str(f, "name")) return { error: "Name and email are required." };
  if (await db.user.findUnique({ where: { email } })) return { error: "That email already has an account." };
  const password = crypto.randomBytes(6).toString("base64url");
  await db.user.create({ data: { orgId: user.orgId, email, name: str(f, "name"), role: str(f, "role") || "recruiter", passwordHash: await bcrypt.hash(password, 10) } });
  revalidatePath("/settings");
  return { ok: `Added ${email}. Temporary password: ${password}` };
}

export async function createApiKey(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = `ja_live_${crypto.randomBytes(24).toString("base64url")}`;
  await db.apiKey.create({
    data: { orgId: user.orgId, name: str(f, "name") || "API key", prefix: raw.slice(0, 12), keyHash: crypto.createHash("sha256").update(raw).digest("hex") },
  });
  revalidatePath("/settings");
  return { ok: raw };
}

export async function deleteApiKey(id: string) {
  const user = await requireUser();
  await db.apiKey.deleteMany({ where: { id, orgId: user.orgId } });
  revalidatePath("/settings");
}

export async function addWebhook(f: FormData) {
  const user = await requireUser();
  const url = str(f, "url");
  if (!/^https?:\/\//.test(url)) return;
  await db.webhook.create({ data: { orgId: user.orgId, url, events: str(f, "events") || "*", secret: `whsec_${crypto.randomBytes(18).toString("base64url")}` } });
  revalidatePath("/settings");
}

export async function deleteWebhook(id: string) {
  const user = await requireUser();
  await db.webhook.deleteMany({ where: { id, orgId: user.orgId } });
  revalidatePath("/settings");
}

export async function addChecklistTemplateItem(f: FormData) {
  const user = await requireUser();
  const title = str(f, "title");
  if (!title) return;
  const count = await db.checklistTemplateItem.count({ where: { orgId: user.orgId } });
  const due = Number(str(f, "dueDaysBeforeJoining"));
  await db.checklistTemplateItem.create({
    data: {
      orgId: user.orgId, title, description: str(f, "description") || null, category: str(f, "category") || "other",
      required: f.get("required") === "on", allowUpload: f.get("allowUpload") === "on",
      dueDaysBeforeJoining: Number.isFinite(due) && due >= 0 ? due : 7, position: count,
    },
  });
  revalidatePath("/settings");
}

export async function deleteChecklistTemplateItem(id: string) {
  const user = await requireUser();
  await db.checklistTemplateItem.deleteMany({ where: { id, orgId: user.orgId } });
  revalidatePath("/settings");
}
