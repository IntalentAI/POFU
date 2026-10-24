// Demo workspace: `npm run db:seed`. Login: demo@acme.test / demo1234
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { addDays, atLocalHour, startOfDayUTC } from "@/lib/dates";
import { PULSE_OPTIONS } from "@/lib/engine/default-campaign";
import { planSchedule } from "@/lib/engine/schedule";
import { render, templateVars } from "@/lib/engine/template";
import { evaluateReadiness } from "@/lib/engine/readiness";
import { createDefaultCampaign, DEFAULT_KNOWLEDGE } from "@/lib/onboarding";

const now = new Date();
const today = startOfDayUTC(now);
const d = (n: number) => addDays(today, n);

type Seed = {
  first: string; last: string; position: string; dept: string; location: string; manager: string;
  accepted: number; joining: number; recruiter: 0 | 1; channel?: string;
  status?: "joined" | "dropped" | "offer_rescinded"; reason?: string; originalJoining?: number;
  confirmedAgo?: number;
  script?: { ago: number; from: "candidate" | "ai" | "recruiter"; body: string }[];
  concerns?: { category: string; severity: string; summary: string; action: string; owner?: string; ago: number; requested?: number }[];
};

const SEEDS: Seed[] = [
  {
    first: "Sarah", last: "Johnson", position: "Senior Software Engineer", dept: "Engineering", location: "San Francisco HQ", manager: "Dana Whitfield",
    accepted: -38, joining: 22, recruiter: 0, confirmedAgo: 10,
    script: [
      { ago: 10, from: "candidate", body: "1 - yes, all on track! Really excited." },
      { ago: 10, from: "ai", body: "Wonderful, thanks Sarah! We're looking forward to seeing you soon." },
      { ago: 2, from: "candidate", body: "Hi Alex, my current employer is asking me to stay another two weeks to finish a handover. Would it be possible to push my start date by two weeks?" },
      { ago: 2, from: "ai", body: "Thanks for letting us know, Sarah. I've passed your joining-date request to Jordan; they'll confirm whether the change works. Until then, your current joining date stands." },
    ],
    concerns: [{ category: "joining_date_change", severity: "medium", summary: "Requested a two-week joining-date extension to finish a handover", action: "Review the requested date and approve or discuss a revised date.", ago: 2, requested: 36 }],
  },
  {
    first: "Michael", last: "Chen", position: "Product Manager", dept: "Product", location: "New York Office", manager: "Priscilla Gomez",
    accepted: -20, joining: 25, recruiter: 0, channel: "email",
    script: [
      { ago: 1, from: "candidate", body: "Hi, I want to be upfront — I received another offer last week and I'm weighing it up. I'm still keen on Acme but would like to talk." },
      { ago: 1, from: "ai", body: "Thanks for sharing that, Michael — I appreciate you being open with us. Would you like to talk it through with Jordan? I've let them know so they can set up a conversation." },
    ],
    concerns: [{ category: "competing_offer", severity: "high", summary: "Disclosed a competing offer and wants to talk", action: "Arrange a recruiter conversation to understand the competing offer.", ago: 1 }],
  },
  {
    first: "Priya", last: "Raman", position: "Data Analyst", dept: "Analytics", location: "Austin Office", manager: "Tom Becker",
    accepted: -30, joining: 16, recruiter: 1, confirmedAgo: 15,
    script: [
      { ago: 3, from: "candidate", body: "Is there any accommodation support for the first month? I'm relocating from Chicago." },
      { ago: 3, from: "ai", body: "Good question, Priya. I don't have a confirmed answer for that yet, so I've asked Sam and will get back to you." },
    ],
    concerns: [{ category: "relocation", severity: "medium", summary: "Relocating from Chicago — requested accommodation information", action: "Share relocation and travel details with the candidate.", owner: "hr_ops", ago: 3 }],
  },
  {
    first: "Diego", last: "Martinez", position: "Account Executive", dept: "Sales", location: "New York Office", manager: "Priscilla Gomez",
    accepted: -40, joining: 9, recruiter: 1,
    script: [
      { ago: 6, from: "candidate", body: "4 - honestly I'm having second thoughts. My manager made a counteroffer." },
      { ago: 6, from: "ai", body: "Thanks for being honest, Diego — that's really helpful to know. Would you be open to a quick conversation with Sam? I've let them know so they can reach out." },
    ],
    concerns: [
      { category: "reconsidering", severity: "high", summary: "Said they are reconsidering the offer (pulse check)", action: "Call the candidate today to understand what has changed.", ago: 6 },
      { category: "counteroffer", severity: "high", summary: "Current employer made a counteroffer", action: "Schedule a recruiter call to discuss the counteroffer.", ago: 6 },
    ],
  },
  { first: "Aisha", last: "Bello", position: "UX Designer", dept: "Design", location: "San Francisco HQ", manager: "Dana Whitfield", accepted: -25, joining: 4, recruiter: 0, confirmedAgo: 3,
    script: [{ ago: 3, from: "candidate", body: "Yes! Confirmed, see you soon 🙂" }, { ago: 3, from: "ai", body: "Great to hear, Aisha! We're looking forward to welcoming you." }] },
  { first: "Tom", last: "Nguyen", position: "DevOps Engineer", dept: "Engineering", location: "Remote (US)", manager: "Dana Whitfield", accepted: -12, joining: 6, recruiter: 0, confirmedAgo: 5 },
  { first: "Grace", last: "Okafor", position: "Customer Success Manager", dept: "Customer Success", location: "Austin Office", manager: "Luis Ortega", accepted: -50, joining: 3, recruiter: 1 },
  { first: "Ben", last: "Hartley", position: "Backend Engineer", dept: "Engineering", location: "San Francisco HQ", manager: "Dana Whitfield", accepted: -9, joining: 40, recruiter: 0 },
  { first: "Lena", last: "Fischer", position: "Marketing Manager", dept: "Marketing", location: "New York Office", manager: "Rachel Kim", accepted: -15, joining: 48, recruiter: 1, confirmedAgo: 8 },
  { first: "Omar", last: "Haddad", position: "Sales Development Rep", dept: "Sales", location: "Austin Office", manager: "Luis Ortega", accepted: -5, joining: 12, recruiter: 1, channel: "sms" },
  { first: "Mei", last: "Tanaka", position: "Frontend Engineer", dept: "Engineering", location: "Remote (US)", manager: "Dana Whitfield", accepted: -33, joining: 30, recruiter: 0, confirmedAgo: 4,
    script: [{ ago: 7, from: "candidate", body: "When will I receive my laptop?" }, { ago: 7, from: "ai", body: "Your laptop is shipped to your home address 5 business days before your start date, with setup instructions in the box." }, { ago: 4, from: "candidate", body: "Perfect, all good on my side. Looking forward to it!" }] },
  { first: "Carlos", last: "Silva", position: "Finance Analyst", dept: "Finance", location: "New York Office", manager: "Rachel Kim", accepted: -60, joining: 1, recruiter: 1, confirmedAgo: 7, originalJoining: -6 },
  { first: "Hannah", last: "Wright", position: "Recruiter", dept: "People", location: "San Francisco HQ", manager: "Luis Ortega", accepted: -2, joining: 58, recruiter: 0 },
  { first: "Ravi", last: "Kumar", position: "ML Engineer", dept: "Engineering", location: "San Francisco HQ", manager: "Dana Whitfield", accepted: -45, joining: 19, recruiter: 0, confirmedAgo: 30 },
  // Historical outcomes for analytics
  { first: "Emma", last: "Brooks", position: "Support Specialist", dept: "Customer Success", location: "Austin Office", manager: "Luis Ortega", accepted: -70, joining: -20, recruiter: 1, status: "joined" },
  { first: "Liam", last: "O'Connor", position: "Backend Engineer", dept: "Engineering", location: "Remote (US)", manager: "Dana Whitfield", accepted: -80, joining: -25, recruiter: 0, status: "joined" },
  { first: "Sofia", last: "Rossi", position: "Account Executive", dept: "Sales", location: "New York Office", manager: "Priscilla Gomez", accepted: -75, joining: -30, recruiter: 1, status: "dropped", reason: "Better competing offer" },
  { first: "Noah", last: "Williams", position: "Data Engineer", dept: "Analytics", location: "Austin Office", manager: "Tom Becker", accepted: -95, joining: -40, recruiter: 0, status: "joined", originalJoining: -54 },
  { first: "Zara", last: "Ahmed", position: "Product Designer", dept: "Design", location: "San Francisco HQ", manager: "Dana Whitfield", accepted: -100, joining: -45, recruiter: 0, status: "joined" },
  { first: "Jack", last: "Turner", position: "Sales Development Rep", dept: "Sales", location: "Austin Office", manager: "Luis Ortega", accepted: -60, joining: -15, recruiter: 1, status: "dropped", reason: "Counteroffer from current employer" },
  { first: "Ines", last: "Moreau", position: "Frontend Engineer", dept: "Engineering", location: "Remote (US)", manager: "Dana Whitfield", accepted: -110, joining: -60, recruiter: 0, status: "joined" },
  { first: "Kofi", last: "Mensah", position: "Finance Analyst", dept: "Finance", location: "New York Office", manager: "Rachel Kim", accepted: -90, joining: -35, recruiter: 1, status: "joined" },
  { first: "Yuki", last: "Sato", position: "QA Engineer", dept: "Engineering", location: "San Francisco HQ", manager: "Dana Whitfield", accepted: -85, joining: -28, recruiter: 0, status: "dropped", reason: "Relocation issues" },
  { first: "Ana", last: "Lopez", position: "Marketing Specialist", dept: "Marketing", location: "New York Office", manager: "Rachel Kim", accepted: -65, joining: -10, recruiter: 1, status: "joined" },
  { first: "Peter", last: "Novak", position: "Account Manager", dept: "Sales", location: "Austin Office", manager: "Luis Ortega", accepted: -70, joining: -12, recruiter: 1, status: "joined" },
  { first: "Fatima", last: "Zahra", position: "HR Generalist", dept: "People", location: "San Francisco HQ", manager: "Luis Ortega", accepted: -50, joining: -5, recruiter: 0, status: "joined" },
];

async function main() {
  await db.organization.deleteMany({ where: { slug: "acme" } });
  const org = await db.organization.create({
    data: { name: "Acme", slug: "acme", timezone: "America/Los_Angeles", companionName: "Alex" },
  });
  const hash = await bcrypt.hash("demo1234", 10);
  const jordan = await db.user.create({ data: { orgId: org.id, email: "demo@acme.test", name: "Jordan Lee", role: "admin", passwordHash: hash } });
  const sam = await db.user.create({ data: { orgId: org.id, email: "sam@acme.test", name: "Sam Patel", role: "recruiter", passwordHash: hash } });
  const recruiters = [jordan, sam];
  const campaign = await createDefaultCampaign(org.id);
  await db.knowledgeItem.createMany({ data: DEFAULT_KNOWLEDGE.map((k) => ({ ...k, orgId: org.id })) });
  const steps = await db.campaignStep.findMany({ where: { campaignId: campaign.id } });

  for (const s of SEEDS) {
    const recruiter = recruiters[s.recruiter];
    const accepted = d(s.accepted);
    const joining = d(s.joining);
    const c = await db.candidate.create({
      data: {
        orgId: org.id, firstName: s.first, lastName: s.last, position: s.position, department: s.dept, location: s.location,
        hiringManagerName: s.manager, recruiterId: recruiter.id, campaignId: campaign.id, source: s.recruiter ? "csv" : "intalent",
        email: `${s.first.toLowerCase()}.${s.last.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
        phone: s.channel === "email" ? null : `+1415555${String(1000 + SEEDS.indexOf(s)).slice(-4)}`,
        preferredChannel: s.channel ?? "whatsapp",
        offerAcceptedAt: atLocalHour(accepted, 15, org.timezone), joiningDate: joining,
        originalJoiningDate: s.originalJoining !== undefined ? d(s.originalJoining) : joining,
        status: s.status ?? "pre_joining", dropoutReason: s.reason ?? null,
        joinedAt: s.status === "joined" ? joining : null,
        lastConfirmedAt: s.confirmedAgo !== undefined ? d(-s.confirmedAgo) : s.status === "joined" ? d(s.joining - 7) : null,
        createdAt: accepted,
      },
    });
    await db.event.create({ data: { candidateId: c.id, type: "enrolled", detail: `Offer accepted — enrolled via ${c.source}.`, createdAt: accepted } });

    // Replay the journey: steps in the past were sent, future steps are scheduled.
    const plan = planSchedule(steps, c, accepted);
    const vars = templateVars({ candidate: c, org, now: accepted });
    for (const { step, day } of plan) {
      const at = step.key === "welcome" ? addDays(c.offerAcceptedAt, 0.01) : atLocalHour(day, org.sendHour, org.timezone);
      const past = at < now || (s.status && day <= joining);
      if (s.status && day > joining) continue;
      if (past) {
        let body = render(step.body, { ...vars, daysToJoin: String(Math.round((joining.getTime() - at.getTime()) / 86400000)) });
        if (step.kind === "pulse") body += "\n\n" + PULSE_OPTIONS.join("\n");
        const msg = await db.message.create({ data: { candidateId: c.id, direction: "outbound", channel: c.preferredChannel, author: "ai", authorName: org.companionName, subject: render(step.subject ?? "", vars), body, delivery: "simulated", createdAt: at } });
        await db.scheduledMessage.create({ data: { candidateId: c.id, stepId: step.id, stepKey: step.key, kind: step.kind, scheduledFor: at, status: "sent", sentAt: at, messageId: msg.id } });
        await db.event.create({ data: { candidateId: c.id, type: "engagement_sent", detail: step.name, actor: "ai", createdAt: at } });
      } else if (!s.status) {
        await db.scheduledMessage.create({ data: { candidateId: c.id, stepId: step.id, stepKey: step.key, kind: step.kind, scheduledFor: at } });
      }
    }
    let lastIn: Date | null = null, lastOut: Date | null = null;
    for (const m of s.script ?? []) {
      const at = new Date(d(-m.ago).getTime() + (m.from === "candidate" ? 17 : 17.05) * 3600_000);
      await db.message.create({
        data: {
          candidateId: c.id, direction: m.from === "candidate" ? "inbound" : "outbound", channel: c.preferredChannel, author: m.from,
          authorName: m.from === "candidate" ? s.first : m.from === "ai" ? org.companionName : recruiter.name,
          body: m.body, delivery: m.from === "candidate" ? "received" : "simulated", createdAt: at,
        },
      });
      if (m.from === "candidate") lastIn = at; else lastOut = at;
    }
    if (s.confirmedAgo !== undefined) await db.event.create({ data: { candidateId: c.id, type: "confirmed", detail: "Confirmed joining plans", actor: "candidate", createdAt: d(-s.confirmedAgo) } });
    for (const k of s.concerns ?? []) {
      await db.concern.create({
        data: {
          orgId: org.id, candidateId: c.id, category: k.category, severity: k.severity, summary: k.summary, suggestedAction: k.action,
          owner: k.owner ?? "recruiter", assigneeId: recruiter.id, requestedDate: k.requested !== undefined ? d(k.requested) : null, createdAt: d(-k.ago),
        },
      });
      await db.event.create({ data: { candidateId: c.id, type: "concern_raised", detail: k.summary, actor: "ai", createdAt: d(-k.ago) } });
    }
    if (s.originalJoining !== undefined) {
      await db.event.create({ data: { candidateId: c.id, type: "joining_date_changed", detail: "Joining date moved at candidate's request", actor: recruiter.name, createdAt: d(s.originalJoining - 10) } });
    }
    if (s.status) {
      await db.event.create({ data: { candidateId: c.id, type: "status_changed", detail: s.status === "joined" ? "Joined — confirmed arrival on Day 1" : `Did not join — ${s.reason}`, actor: recruiter.name, createdAt: joining } });
    }
    await db.candidate.update({ where: { id: c.id }, data: { lastInboundAt: lastIn ?? (s.confirmedAgo !== undefined ? d(-s.confirmedAgo) : null), lastOutboundAt: lastOut } });
    if (!s.status) await evaluateReadiness(c.id, now);
  }
  console.log(`Seeded ${SEEDS.length} candidates. Login: demo@acme.test / demo1234`);
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
