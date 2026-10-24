// Deterministic fallback interpreter used when no Claude API key is configured
// (or the API call fails). Covers the pulse quick-replies and common concern phrasing.
import { addDays, daysBetween, fmtDate, parseDateOnly, toDateInput } from "../dates";
import type { ConversationContext, Interpretation } from "./types";

type Cat = Interpretation["concerns"][number]["category"];

const PATTERNS: [Cat, RegExp, string][] = [
  ["withdrawal", /\b(withdraw|won'?t be joining|not (going to|gonna) join|backing out|decline the offer|declining the offer|not joining)\b/i, "Indicated they may withdraw from the offer"],
  ["reconsidering", /\b(reconsider|second thoughts|not sure (about|if) (joining|i want)|rethink|having doubts)\b/i, "Said they are reconsidering the offer"],
  ["counteroffer", /\b(counter ?offer|asked me to stay|asking me to stay|wants? me to stay|retain me|retention)\b/i, "Current employer is trying to retain them (counteroffer / retention discussion)"],
  ["competing_offer", /\b(another offer|other offer|competing offer|different offer|offer from)\b/i, "Mentioned another offer"],
  ["salary", /\b(salary|compensation|pay|bonus|ctc|package|equity|stock)\b/i, "Asked about compensation"],
  ["joining_date_change", /\b(change (my |the )?(joining|start) date|postpone|extend|extension|delay|push (it )?back|later (start|date)|join later|move (my )?(start|joining))\b/i, "Requested a joining-date change"],
  ["relocation", /\b(relocat|accommodation|housing|visa|flight|move to|moving to|shifting to)\b/i, "Needs relocation / travel support"],
  ["documentation", /\b(document|certificate|payslip|pay slip|relieving letter|experience letter|background (check|verification)|id proof)\b/i, "Has a question or issue with documentation"],
  ["manager", /\b(manager)\b.*\b(concern|worried|unhappy|issue|problem)\b|\b(concern|worried|unhappy)\b.*\bmanager\b/i, "Raised a concern about the manager or team"],
  ["personal", /\b(family|health|medical|hospital|personal (reason|issue|circumstance)|emergency)\b/i, "Mentioned personal circumstances"],
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function extractDate(text: string, ctx: ConversationContext): string | null {
  const iso = parseDateOnly(text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "");
  if (iso) return toDateInput(iso);
  const md = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (md) {
    const day = Number(md[1] ?? md[4]);
    const month = MONTHS.indexOf((md[2] ?? md[3]).toLowerCase().slice(0, 3));
    let year = ctx.now.getUTCFullYear();
    if (Date.UTC(year, month, day) < ctx.now.getTime()) year++;
    return toDateInput(new Date(Date.UTC(year, month, day)));
  }
  const rel = text.match(/\b(one|two|three|four|a|an|\d+)\s+(week|month)s?\b/i);
  if (rel) {
    const n = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 }[rel[1].toLowerCase()] ?? Number(rel[1]);
    return toDateInput(addDays(ctx.candidate.joiningDate, rel[2].toLowerCase() === "week" ? n * 7 : n * 30));
  }
  return null;
}

function findAnswer(text: string, ctx: ConversationContext) {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const q = words(text);
  let best: { answer: string; score: number } | null = null;
  for (const k of ctx.knowledge) {
    const kw = words(k.question);
    const score = [...kw].filter((w) => q.has(w)).length / Math.max(1, kw.size);
    if (score >= 0.34 && (!best || score > best.score)) best = { answer: k.answer, score };
  }
  return best?.answer ?? null;
}

export function interpretWithRules(text: string, ctx: ConversationContext): Interpretation {
  const t = text.trim();
  const lower = t.toLowerCase();
  const name = ctx.candidate.firstName;
  const recruiter = ctx.candidate.recruiterName ?? "your recruiter";
  const joinStr = fmtDate(ctx.candidate.joiningDate, { weekday: "long", month: "long", day: "numeric", year: undefined });
  const base: Interpretation = {
    intent: "small_talk", confirmsJoiningDate: false, concerns: [], requestedJoiningDate: null,
    answeredFromKnowledge: false, sentiment: "neutral", reply: "",
  };

  if (/^(stop|unsubscribe|opt ?out)\b/i.test(lower)) {
    return { ...base, intent: "opt_out", reply: `Understood, ${name} — I won't send any more automated messages. ${recruiter} is still available if you need anything.` };
  }

  // Pulse quick replies.
  if (ctx.lastPromptKind === "pulse" && /^[1-4]\b/.test(lower)) {
    const n = lower[0];
    if (n === "1") return { ...base, intent: "confirm", confirmsJoiningDate: true, sentiment: "positive", reply: `Wonderful, thanks ${name}! We're looking forward to seeing you on ${joinStr}.` };
    if (n === "2") return { ...base, intent: "date_change", concerns: [{ category: "joining_date_change", summary: "Said they may need to change their joining date" }], reply: `Thanks for letting us know, ${name}. What date would work better for you, and what's driving the change? I'll pass it to ${recruiter} — only they can approve a new date.` };
    if (n === "3") return { ...base, intent: "question", reply: `Of course — what would you like to know? Ask away and I'll answer or find the right person.` };
    if (n === "4") return { ...base, intent: "reconsidering", sentiment: "negative", concerns: [{ category: "reconsidering", summary: "Said they are reconsidering the offer (pulse check)" }], reply: `Thanks for being honest, ${name} — that's really helpful to know. Would you be open to a quick conversation with ${recruiter}? I've let them know so they can reach out.` };
  }

  if (ctx.lastPromptKind === "arrival" && /\b(yes|arrived|here|reached|made it|in the office)\b/i.test(lower)) {
    return { ...base, intent: "arrived", confirmsJoiningDate: true, sentiment: "positive", reply: `Brilliant — welcome to ${ctx.company}, ${name}! Have a fantastic first day. 🎉` };
  }

  const concerns: Interpretation["concerns"] = [];
  for (const [category, re, summary] of PATTERNS) {
    if (re.test(t) && !concerns.some((c) => c.category === category)) concerns.push({ category, summary });
  }
  const requestedJoiningDate = concerns.some((c) => c.category === "joining_date_change" || c.category === "counteroffer") ? extractDate(t, ctx) : null;
  if (requestedJoiningDate) {
    const dc = concerns.find((c) => c.category === "joining_date_change");
    const shift = daysBetween(ctx.candidate.joiningDate, parseDateOnly(requestedJoiningDate)!);
    const summary = `Requested a new joining date of ${fmtDate(parseDateOnly(requestedJoiningDate))} (${shift >= 0 ? "+" : ""}${shift} days)`;
    if (dc) dc.summary = summary; else concerns.push({ category: "joining_date_change", summary });
  }

  if (concerns.length) {
    const cats = new Set(concerns.map((c) => c.category));
    const intent: Interpretation["intent"] = cats.has("withdrawal") ? "withdraw" : cats.has("reconsidering") ? "reconsidering" : cats.size === 1 && cats.has("joining_date_change") ? "date_change" : "concern";
    let reply: string;
    if (intent === "withdraw") reply = `Thank you for telling us, ${name}. I'm sorry to hear that. Could you share what led to this decision? I've let ${recruiter} know — they'll reach out to confirm and make sure everything is handled properly.`;
    else if (cats.has("salary")) reply = `Thanks for raising this, ${name}. I can't discuss or change offer terms myself, but I've asked ${recruiter} to get back to you about it directly.`;
    else if (cats.has("counteroffer") || cats.has("competing_offer")) reply = `Thanks for sharing that, ${name} — I appreciate you being open with us. Would you like to talk it through with ${recruiter}? I've let them know so they can set up a conversation.`;
    else if (intent === "date_change") reply = `Thanks for letting us know, ${name}. I've passed your joining-date request to ${recruiter}; they'll confirm whether the change works. Until then, ${joinStr} remains your joining date.`;
    else reply = `Thanks for letting us know, ${name}. I've shared this with ${recruiter} so the right person can help. Is there anything else on your mind?`;
    return { ...base, intent, concerns, requestedJoiningDate, sentiment: "negative", reply };
  }

  if (/\b(yes|yep|yeah|confirmed?|on track|all good|see you|looking forward|still joining|all set)\b/i.test(lower) && !t.includes("?")) {
    return { ...base, intent: "confirm", confirmsJoiningDate: true, sentiment: "positive", reply: `Great to hear, ${name}! We're looking forward to welcoming you on ${joinStr}.` };
  }

  if (t.includes("?") || /^(what|when|where|how|who|can|do|is|will|should)\b/i.test(lower)) {
    const answer = findAnswer(t, ctx);
    if (answer) return { ...base, intent: "question", answeredFromKnowledge: true, reply: `${answer}\n\nAnything else I can help with, ${name}?` };
    return {
      ...base, intent: "question",
      concerns: [{ category: "unanswered_question", summary: `Asked: "${t.slice(0, 140)}"` }],
      reply: `Good question, ${name}. I don't have a confirmed answer for that yet, so I've asked ${recruiter} and will get back to you.`,
    };
  }

  if (/\b(thanks|thank you|great|awesome|excited|cool|ok|okay)\b/i.test(lower)) {
    return { ...base, sentiment: "positive", reply: `You're welcome, ${name}! I'm here whenever you need anything.` };
  }
  return { ...base, reply: `Thanks, ${name}. I've noted that. Is there anything I can help you with before your first day?` };
}
