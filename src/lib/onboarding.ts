import bcrypt from "bcryptjs";
import { db } from "./db";
import { DEFAULT_STEPS } from "./engine/default-campaign";

export const DEFAULT_KNOWLEDGE = [
  { question: "What documents do I need to submit?", answer: "HR will send you a secure link to upload your ID, education certificates, last three payslips, relieving/experience letters, and bank and tax details. Please don't share documents in chat." },
  { question: "When will I receive my laptop?", answer: "Your laptop is shipped to your home address 5 business days before your start date, with setup instructions in the box." },
  { question: "Is there a dress code?", answer: "Smart casual. Most people wear jeans and a comfortable top; client-facing days may be a little smarter." },
  { question: "What happens on my first day?", answer: "You'll arrive at 9:00 AM, meet the People team for a welcome session and paperwork, have lunch with your team, and spend the afternoon getting set up with your manager." },
  { question: "When will my benefits begin?", answer: "Health benefits start on your first day. You'll receive enrolment details during your first week." },
  { question: "Who will be my reporting manager?", answer: "Your reporting manager is named in your offer letter; your joining page also shows who will be expecting you." },
  { question: "How do I submit my resignation documents?", answer: "Once you receive your relieving/experience letter from your current employer, upload it through the secure HR document link." },
  { question: "Can I change my joining date?", answer: "Possibly — joining date changes need recruiter approval. Tell me the date you have in mind and why, and I'll pass it to your recruiter." },
];

export async function createDefaultCampaign(orgId: string) {
  return db.campaign.create({
    data: {
      orgId, name: "Standard joining journey", isDefault: true,
      description: "Default offer-to-Day-1 journey. Adapts automatically to the length of the notice period.",
      steps: { create: DEFAULT_STEPS.map((s, i) => ({ ...s, optional: s.optional ?? false, position: i })) },
    },
  });
}

function validTimeZone(tz: string | undefined) {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** Self-serve signup (product-led growth): a new workspace with sensible defaults. */
export async function createWorkspace(input: { company: string; name: string; email: string; password: string; timezone?: string }) {
  const base = input.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
  let slug = base;
  for (let i = 2; await db.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  const org = await db.organization.create({ data: { name: input.company, slug, timezone: validTimeZone(input.timezone) } });
  await createDefaultCampaign(org.id);
  await db.knowledgeItem.createMany({ data: DEFAULT_KNOWLEDGE.map((k) => ({ ...k, orgId: org.id })) });
  return db.user.create({
    data: { orgId: org.id, email: input.email.toLowerCase(), name: input.name, role: "admin", passwordHash: await bcrypt.hash(input.password, 10) },
  });
}
