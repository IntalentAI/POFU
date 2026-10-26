import type { Candidate, ChecklistItem } from "@prisma/client";
import { db } from "./db";
import { addDays, fmtDate, startOfDayUTC } from "./dates";
import { logEvent } from "./events";
import { emitWebhook } from "./webhooks";
import { signFileLink } from "./storage";

// Default employer checklist (brief §7). Employers edit it in Settings; it is copied to
// each candidate on enrollment, so a later template change doesn't alter existing candidates.
export const DEFAULT_CHECKLIST = [
  { title: "Identity verification", category: "identity", description: "A government-issued photo ID (passport, driving licence or national ID).", required: true, allowUpload: true, dueDaysBeforeJoining: 14 },
  { title: "Education documents", category: "education", description: "Your highest degree or diploma certificate.", required: true, allowUpload: true, dueDaysBeforeJoining: 10 },
  { title: "Employment verification", category: "employment", description: "Relieving or experience letter from your current or most recent employer.", required: true, allowUpload: true, dueDaysBeforeJoining: 3 },
  { title: "Bank details", category: "bank", description: "A cancelled cheque or bank letter showing your account details, for payroll.", required: true, allowUpload: true, dueDaysBeforeJoining: 7 },
  { title: "Tax documentation", category: "tax", description: "Your tax ID document or the tax form HR sends you.", required: true, allowUpload: true, dueDaysBeforeJoining: 7 },
  { title: "Background verification", category: "background", description: "Completed by our verification partner. You'll receive a separate consent request; nothing to upload here.", required: true, allowUpload: false, dueDaysBeforeJoining: 3 },
  { title: "Joining forms", category: "forms", description: "Signed joining forms (HR sends these with your offer pack).", required: true, allowUpload: true, dueDaysBeforeJoining: 3 },
  { title: "First-day instructions reviewed", category: "other", description: "Read your first-day details on this page and confirm.", required: false, allowUpload: false, dueDaysBeforeJoining: 1 },
];

export const CATEGORY_LABEL: Record<string, string> = {
  identity: "Identity", education: "Education", employment: "Employment", bank: "Bank", tax: "Tax",
  background: "Background check", forms: "Forms", other: "Other",
};

export const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "To do", submitted: "Submitted — awaiting review", verified: "Verified", rejected: "Needs attention", waived: "Not required",
};

export const isDone = (i: Pick<ChecklistItem, "status">) => i.status === "verified" || i.status === "waived";

/** Copy the employer's checklist to a newly enrolled candidate. */
export async function createCandidateChecklist(candidate: Candidate) {
  const template = await db.checklistTemplateItem.findMany({ where: { orgId: candidate.orgId }, orderBy: { position: "asc" } });
  if (!template.length) return;
  await db.checklistItem.createMany({
    data: template.map((t, i) => ({
      candidateId: candidate.id, title: t.title, description: t.description, category: t.category,
      required: t.required, allowUpload: t.allowUpload, position: i,
      dueDate: addDays(startOfDayUTC(candidate.joiningDate), -t.dueDaysBeforeJoining),
    })),
  });
}

/** Keep due dates relative to a changed joining date (only for items still open). */
export async function shiftChecklistDueDates(candidateId: string, oldJoining: Date, newJoining: Date) {
  const delta = startOfDayUTC(newJoining).getTime() - startOfDayUTC(oldJoining).getTime();
  const items = await db.checklistItem.findMany({ where: { candidateId, dueDate: { not: null }, status: { in: ["pending", "rejected"] } } });
  for (const it of items) await db.checklistItem.update({ where: { id: it.id }, data: { dueDate: new Date(it.dueDate!.getTime() + delta) } });
}

export async function outstandingItems(candidateId: string) {
  return db.checklistItem.findMany({
    where: { candidateId, required: true, status: { in: ["pending", "rejected", "submitted"] } },
    orderBy: { position: "asc" },
  });
}

/**
 * Plain-text list of what the candidate still needs to do (used in reminders). Items the
 * candidate can't act on themselves (e.g. a background check run by a vendor) are left out.
 */
export function outstandingList(items: ChecklistItem[], now = new Date()) {
  return items
    .filter((i) => i.status !== "submitted" && (i.allowUpload || i.category !== "background"))
    .map((i) => {
      const fix = i.status === "rejected" ? ` (please re-upload${i.note ? `: ${i.note}` : ""})` : "";
      const due = !i.dueDate ? "" : i.dueDate < startOfDayUTC(now) ? " (overdue)" : ` (by ${fmtDate(i.dueDate, { year: undefined })})`;
      return `• ${i.title}${fix}${due}`;
    })
    .join("\n");
}

/**
 * When every required item is verified or waived, mark the candidate onboarding-ready and
 * hand off to the HRIS: a webhook with the profile, checklist and signed document links.
 */
export async function checkOnboardingReady(candidateId: string) {
  const c = await db.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    include: { checklist: { orderBy: { position: "asc" } }, documents: true, recruiter: { select: { name: true, email: true } } },
  });
  const required = c.checklist.filter((i) => i.required);
  const ready = required.length > 0 && required.every(isDone);
  if (ready && !c.onboardingReadyAt) {
    await db.candidate.update({ where: { id: c.id }, data: { onboardingReadyAt: new Date() } });
    await logEvent(c.id, "onboarding_ready", "All required documents verified — ready for onboarding handoff");
    await emitWebhook(c.orgId, "candidate.ready_for_onboarding", onboardingPayload(c));
  } else if (!ready && c.onboardingReadyAt) {
    await db.candidate.update({ where: { id: c.id }, data: { onboardingReadyAt: null } });
  }
  return ready;
}

type FullCandidate = Candidate & { checklist: ChecklistItem[]; documents: { id: string; checklistItemId: string | null; fileName: string; contentType: string; size: number; createdAt: Date }[]; recruiter: { name: string; email: string } | null };

export function onboardingPayload(c: FullCandidate) {
  return {
    candidateId: c.id, externalId: c.externalId,
    firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone,
    position: c.position, department: c.department, location: c.location,
    hiringManagerName: c.hiringManagerName, hiringManagerEmail: c.hiringManagerEmail,
    recruiter: c.recruiter, joiningDate: c.joiningDate.toISOString().slice(0, 10),
    checklist: c.checklist.map((i) => ({
      title: i.title, category: i.category, required: i.required, status: i.status, reviewedAt: i.reviewedAt,
      documents: c.documents.filter((d) => d.checklistItemId === i.id).map((d) => ({
        fileName: d.fileName, contentType: d.contentType, size: d.size, uploadedAt: d.createdAt,
        url: signFileLink(d.id), // valid for 24 hours
      })),
    })),
  };
}
