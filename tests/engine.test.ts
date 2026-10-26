import { test } from "node:test";
import assert from "node:assert/strict";
import type { CampaignStep } from "@prisma/client";
import { addDays, atLocalHour, isQuietHour, parseDateOnly } from "../src/lib/dates";
import { DEFAULT_STEPS } from "../src/lib/engine/default-campaign";
import { planSchedule } from "../src/lib/engine/schedule";
import { render } from "../src/lib/engine/template";
import { interpretWithRules } from "../src/lib/ai/rules";
import type { ConversationContext } from "../src/lib/ai/types";
import { parseCsv } from "../src/lib/csv";

const steps: CampaignStep[] = DEFAULT_STEPS.map((s, i) => ({
  ...s, id: s.key, campaignId: "c", optional: s.optional ?? false, position: i, objective: s.objective, subject: s.subject,
}));
const today = parseDateOnly("2026-10-24")!;
const plan = (noticeDays: number) => planSchedule(steps, { offerAcceptedAt: today, joiningDate: addDays(today, noticeDays) }, today).map((p) => p.step.key);

test("schedule adapts to notice period length", () => {
  const short = plan(7), long = plan(90);
  assert.ok(long.length > short.length, `90-day plan (${long.length}) should have more touchpoints than 7-day (${short.length})`);
  for (const p of [short, long]) {
    assert.ok(p.includes("welcome"));
    assert.ok(p.includes("first_day"));
    assert.ok(p.includes("day1"));
  }
  assert.ok(!short.includes("pulse_mid"), "no mid-notice pulse for a 7-day notice");
  assert.ok(long.includes("pulse_mid") && long.includes("pulse_confirm"));
});

test("no touchpoint lands after the joining date or too close to another (except the final days)", () => {
  for (const n of [5, 10, 14, 21, 30, 45, 60, 90]) {
    const p = planSchedule(steps, { offerAcceptedAt: today, joiningDate: addDays(today, n) }, today);
    const joining = addDays(today, n);
    for (const x of p) assert.ok(x.day <= joining);
    const regular = p.filter((x) => !(x.step.anchor === "before_joining" && x.step.offset <= 1));
    regular.sort((a, b) => a.day.getTime() - b.day.getTime());
    for (let i = 1; i < regular.length; i++) {
      assert.ok(regular[i].day.getTime() - regular[i - 1].day.getTime() >= 2 * 86400000, `gap too small for ${n}-day notice`);
    }
  }
});

test("rebuild skips steps already sent", () => {
  const p = planSchedule(steps, { offerAcceptedAt: today, joiningDate: addDays(today, 60) }, today, new Set(["welcome"]));
  assert.ok(!p.some((x) => x.step.key === "welcome"));
});

test("template rendering", () => {
  assert.equal(render("Hi {{firstName}} at {{company}} {{unknown}}", { firstName: "Sarah", company: "Acme" }), "Hi Sarah at Acme {{unknown}}");
});

test("quiet hours and local send time", () => {
  const at = atLocalHour(today, 10, "America/Los_Angeles");
  assert.equal(at.toISOString(), "2026-10-24T17:00:00.000Z");
  assert.equal(isQuietHour(new Date("2026-10-25T05:00:00Z"), "America/Los_Angeles", 21, 9), true); // 10pm PT
  assert.equal(isQuietHour(at, "America/Los_Angeles", 21, 9), false);
});

const ctx = (lastPromptKind: string | null = null): ConversationContext => ({
  company: "Acme", companion: "Alex",
  candidate: { firstName: "Sarah", position: "Engineer", joiningDate: parseDateOnly("2026-11-15")!, location: "SF", hiringManagerName: "Dana", recruiterName: "Jordan" },
  knowledge: [{ question: "Is there a dress code?", answer: "Smart casual." }],
  language: "en",
  details: { firstDayTime: "9:30 AM", firstDayAddress: "1 Market St, San Francisco", firstDayNotes: "Bring photo ID." },
  checklist: [
    { title: "Identity verification", status: "verified", required: true, dueDate: null },
    { title: "Bank details", status: "pending", required: true, dueDate: null },
    { title: "Tax documentation", status: "rejected", required: true, dueDate: null },
    { title: "Background verification", status: "pending", required: true, dueDate: null, category: "background", allowUpload: false },
  ],
  history: [], lastPromptKind, now: today,
});

test("rules: pulse quick replies", () => {
  assert.equal(interpretWithRules("1", ctx("pulse")).confirmsJoiningDate, true);
  const r4 = interpretWithRules("4", ctx("pulse"));
  assert.equal(r4.intent, "reconsidering");
  assert.equal(r4.concerns[0].category, "reconsidering");
});

test("rules: counteroffer with date request is escalated, never approved", () => {
  const r = interpretWithRules("My current employer is asking me to stay another two weeks, can I push my joining date?", ctx());
  const cats = r.concerns.map((c) => c.category);
  assert.ok(cats.includes("counteroffer"));
  assert.ok(cats.includes("joining_date_change"));
  assert.equal(r.requestedJoiningDate, "2026-11-29");
  assert.ok(!/approved|confirmed as/i.test(r.reply));
});

test("rules: answers only from approved knowledge, escalates otherwise", () => {
  const known = interpretWithRules("Is there a dress code?", ctx());
  assert.equal(known.answeredFromKnowledge, true);
  assert.match(known.reply, /Smart casual/);
  const unknown = interpretWithRules("Is there parking at the office?", ctx());
  assert.equal(unknown.answeredFromKnowledge, false);
  assert.equal(unknown.concerns[0].category, "unanswered_question");
});

test("rules: withdrawal, salary and opt-out", () => {
  assert.equal(interpretWithRules("I won't be joining, sorry", ctx()).intent, "withdraw");
  assert.equal(interpretWithRules("Can we revisit the salary?", ctx()).concerns[0].category, "salary");
  assert.equal(interpretWithRules("STOP", ctx()).intent, "opt_out");
});

test("csv parser handles quotes and headers", () => {
  const rows = parseCsv('First Name,position,joining_date\n"Rivera, Jamie",Engineer,2026-12-01\n');
  assert.equal(rows[0].first_name, "Rivera, Jamie");
  assert.equal(rows[0].joining_date, "2026-12-01");
});

test("regular check-ins never crowd the welcome, the day before, or Day 1", () => {
  for (const n of [2, 3, 5, 7, 9]) {
    const p = planSchedule(steps, { offerAcceptedAt: today, joiningDate: addDays(today, n) }, today);
    const essential = p.filter((x) => x.step.key === "welcome" || (x.step.anchor === "before_joining" && x.step.offset <= 1));
    for (const x of p.filter((y) => !essential.includes(y))) {
      for (const e of essential) assert.ok(Math.abs(x.day.getTime() - e.day.getTime()) >= 2 * 86400000, `${x.step.key} too close to ${e.step.key} (${n}-day notice)`);
    }
  }
});

test("rules: answers document status from the candidate's own checklist", () => {
  const r = interpretWithRules("What documents do I still need to submit?", ctx());
  assert.equal(r.answeredFromKnowledge, true);
  assert.match(r.reply, /Bank details/);
  assert.match(r.reply, /Tax documentation/);
  assert.doesNotMatch(r.reply, /Identity verification/);
  assert.doesNotMatch(r.reply, /Background verification/, "vendor-run check isn't the candidate's to submit");
});

test("rules: answers first-day logistics from confirmed details", () => {
  const r = interpretWithRules("What time should I arrive on my first day?", ctx());
  assert.match(r.reply, /9:30 AM/);
  assert.match(r.reply, /1 Market St/);
});

test("journey: welcome, documentation reminder and voice steps are in the default plan", () => {
  const p = plan(60);
  assert.ok(p.includes("hm_message"), "hiring-manager welcome step planned (skipped at send time if nothing recorded)");
  assert.ok(p.includes("docs_reminder"));
  const kinds = new Map(steps.map((s) => [s.key, s.kind]));
  assert.equal(kinds.get("hm_message"), "welcome");
  assert.equal(kinds.get("docs_reminder"), "docs");
  assert.equal(kinds.get("voice_checkin"), "voice");
});

test("rules: 'push my start date' is a date-change request", () => {
  const r = interpretWithRules("My visa paperwork is delayed, I might need to push my start date by two weeks.", ctx());
  assert.ok(r.concerns.some((c) => c.category === "joining_date_change"));
  assert.equal(r.requestedJoiningDate, "2026-11-29");
});
