// AI voice check-ins (brief §12). The call is a short, consented conversation:
// disclosure → good time? → joining date → documents → logistics → anything else.
// Each candidate answer goes through the same interpreter as a WhatsApp/email reply,
// so confirmations, concerns and recruiter alerts work identically.
import { db } from "../db";
import { CONCERN_CATEGORIES, type ConcernCategory } from "../constants";
import { daysBetween, fmtDate } from "../dates";
import { logEvent } from "../events";
import { outstandingItems } from "../checklist";
import { handleInboundMessage } from "./inbound";
import { deliverToCandidate } from "./outbound";
import { raiseConcern } from "./actions";
import { evaluateReadiness } from "./readiness";

export type Turn = { speaker: "ai" | "candidate"; text: string };
type Analysis = { intent: string; confirmsJoiningDate: boolean; concerns: { category: string; summary: string }[] };

const MAX_QUESTIONS = 4;

export function voiceConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VOICE_FROM);
}

const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

async function loadCall(callId: string) {
  return db.voiceCall.findUniqueOrThrow({
    where: { id: callId },
    include: { candidate: { include: { org: true, recruiter: { select: { name: true } } } } },
  });
}
type LoadedCall = Awaited<ReturnType<typeof loadCall>>;

const parse = (json: string): Turn[] => { try { return JSON.parse(json) as Turn[]; } catch { return []; } };

/** Start a check-in call. Without a voice provider, a recruiter-started call runs in the simulator. */
export async function startVoiceCall(candidateId: string, requestedBy: string): Promise<{ ok: boolean; reason: string; callId?: string; simulated?: boolean }> {
  const c = await db.candidate.findUniqueOrThrow({ where: { id: candidateId }, include: { org: true } });
  if (c.status !== "pre_joining") return { ok: false, reason: "Candidate is not pre-joining" };
  if (!c.voiceConsentAt) return { ok: false, reason: "Candidate hasn't agreed to voice check-ins" };
  if (c.optedOut) return { ok: false, reason: "Candidate opted out of automated contact" };
  const recent = await db.voiceCall.findFirst({ where: { candidateId, createdAt: { gte: new Date(Date.now() - 3 * 86400_000) }, status: { in: ["queued", "in_progress", "completed"] } } });
  if (recent && requestedBy === "journey") return { ok: false, reason: "A check-in call already happened in the last 3 days" };

  const simulated = !voiceConfigured();
  if (simulated && requestedBy === "journey") return { ok: false, reason: "No voice provider configured" };
  if (!simulated && !c.phone) return { ok: false, reason: "Candidate has no phone number" };

  const call = await db.voiceCall.create({
    data: { candidateId, provider: simulated ? "simulator" : "twilio", requestedBy, status: simulated ? "in_progress" : "queued", startedAt: simulated ? new Date() : null },
  });
  await logEvent(candidateId, "voice_call", `${simulated ? "Simulated v" : "V"}oice check-in ${simulated ? "started" : "placed"}`, requestedBy === "journey" ? "ai" : requestedBy);

  if (simulated) {
    await db.voiceCall.update({ where: { id: call.id }, data: { transcript: JSON.stringify([{ speaker: "ai", text: openingLine(c, c.org) }]) } });
    return { ok: true, reason: "Simulated call started", callId: call.id, simulated: true };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      To: c.phone!, From: process.env.TWILIO_VOICE_FROM!,
      Url: `${appUrl()}/api/voice/twilio?call=${call.id}&step=start`,
      StatusCallback: `${appUrl()}/api/voice/twilio/status?call=${call.id}`,
      StatusCallbackEvent: "completed",
      Timeout: "25",
    }),
  });
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) {
    await db.voiceCall.update({ where: { id: call.id }, data: { status: "failed", summary: json.message ?? `Twilio ${res.status}`, endedAt: new Date() } });
    return { ok: false, reason: `Call failed: ${json.message ?? res.status}` };
  }
  await db.voiceCall.update({ where: { id: call.id }, data: { providerId: json.sid } });
  return { ok: true, reason: "Call placed", callId: call.id };
}

function openingLine(c: { firstName: string; joiningDate: Date }, org: { name: string; companionName: string }) {
  const date = fmtDate(c.joiningDate, { weekday: "long", month: "long", day: "numeric", year: undefined });
  return `Hi ${c.firstName}, this is ${org.companionName}, an AI assistant calling on behalf of ${org.name} about your joining on ${date}. ` +
    `Is now a good time for a quick two-minute check-in? You can say "call me later", or ask to speak with a person, at any time.`;
}

/** The call's opening (what the AI says when the candidate picks up). */
export async function callOpening(callId: string) {
  const call = await loadCall(callId);
  const turns = parse(call.transcript);
  if (!turns.length) {
    turns.push({ speaker: "ai", text: openingLine(call.candidate, call.candidate.org) });
    await db.voiceCall.update({ where: { id: callId }, data: { transcript: JSON.stringify(turns), status: "in_progress", startedAt: new Date() } });
  }
  return turns[turns.length - 1].text;
}

const DECLINE = /\b(not (a )?good time|call (me )?(back|later)|busy|can'?t talk|driving|in a meeting|not now|no time)\b/i;
const PERSON = /\b(speak|talk) (to|with) (a )?(person|human|someone|recruiter)\b|\b(real person|human)\b/i;
const NO = /^\s*(no|nope|nah)\b/i;

/** Next agenda question, skipping topics that don't apply. */
async function nextQuestion(call: LoadedCall, asked: number) {
  const c = call.candidate;
  const date = fmtDate(c.joiningDate, { weekday: "long", month: "long", day: "numeric", year: undefined });
  const questions: (() => Promise<string | null>)[] = [
    async () => `Great. Is ${date} still your planned joining date?`,
    async () => {
      const open = (await outstandingItems(c.id)).filter((i) => i.status !== "submitted");
      if (!open.length) return null;
      return `Thanks. You still have ${open.length} document${open.length === 1 ? "" : "s"} to share, including your ${open[0].title.toLowerCase()}. Is anything getting in the way?`;
    },
    async () => `Is everything sorted for getting to ${c.location || "the office"} on your first day, travel or relocation included?`,
    async () => `Last one: is there anything else on your mind before you join, or anything we can help with?`,
  ];
  for (let i = asked; i < questions.length; i++) {
    const q = await questions[i]();
    if (q) return { text: q, index: i + 1 };
  }
  return null;
}

/**
 * One conversational turn: record what the candidate said, understand it, and return the
 * AI's next line plus whether the call should end.
 */
export async function voiceTurn(callId: string, speech: string): Promise<{ say: string; end: boolean }> {
  const call = await loadCall(callId);
  const c = call.candidate;
  const turns = parse(call.transcript);
  const text = speech.trim();
  turns.push({ speaker: "candidate", text: text || "(no answer)" });
  const first = call.turns === 0;
  const recruiter = c.recruiter?.name ?? "your recruiter";

  let say: string;
  let end = false;
  let outcome: string | undefined;
  // `turns` holds the agenda position (index of the next question), so skipped topics aren't re-asked.
  let agenda = call.turns;

  if (PERSON.test(text)) {
    await raiseConcern(c, "other", "Asked to speak with a person during a voice check-in", { actor: "candidate" });
    say = `Of course. I've asked ${recruiter} to call you back personally. Thanks, ${c.firstName}, and goodbye for now.`;
    end = true; outcome = "callback";
  } else if (first && (DECLINE.test(text) || NO.test(text))) {
    await logEvent(c.id, "voice_call", "Candidate asked to be called another time", "candidate");
    say = `No problem at all. I'll let ${recruiter} know, and you can always reply to our messages instead. Have a good day, ${c.firstName}.`;
    end = true; outcome = "declined";
  } else {
    let reply = "";
    if (!first) {
      // Same pipeline as a WhatsApp/email reply: confirmations, concerns, alerts, readiness.
      const r = await handleInboundMessage(c.id, text, "voice");
      reply = r?.analysis.reply ?? "";
      if (r && ["withdraw", "opt_out"].includes(r.analysis.intent)) {
        say = `${reply} Thank you for letting us know, ${c.firstName}. Goodbye.`;
        end = true;
      }
    }
    if (!end) {
      const next = call.turns < MAX_QUESTIONS ? await nextQuestion(call, call.turns) : null;
      if (next) agenda = next.index;
      if (next) {
        say = first ? next.text : `${trimForVoice(reply)} ${next.text}`.trim();
      } else {
        say = `${trimForVoice(reply)} Thanks so much for your time, ${c.firstName}. We're looking forward to seeing you. Goodbye!`.trim();
        end = true;
      }
    }
  }
  turns.push({ speaker: "ai", text: say! });
  await db.voiceCall.update({ where: { id: callId }, data: { transcript: JSON.stringify(turns), turns: end ? Math.max(agenda, call.turns + 1) : agenda, ...(outcome ? { outcome } : {}) } });
  if (end) await finishCall(callId, "completed");
  return { say: say!, end };
}

/** Voice replies drop links and lists that only make sense in writing. */
function trimForVoice(text: string) {
  return text.replace(/https?:\/\/\S+/g, "your joining page").replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Close the call: status, explainable summary (brief §12 format), timeline event. Idempotent. */
export async function finishCall(callId: string, status: string) {
  const call = await loadCall(callId);
  if (call.endedAt) return call;
  const c = call.candidate;
  const turns = parse(call.transcript);
  const answered = turns.filter((t) => t.speaker === "candidate" && t.text !== "(no answer)").length;

  // Pull the interpretations of what was said on this call from the conversation log.
  const since = call.startedAt ?? call.createdAt;
  const inbound = await db.message.findMany({ where: { candidateId: c.id, channel: "voice", direction: "inbound", createdAt: { gte: since } } });
  const analyses = inbound.map((m) => { try { return JSON.parse(m.analysis ?? "{}") as Analysis; } catch { return null; } }).filter(Boolean) as Analysis[];
  const confirmed = analyses.some((a) => a.confirmsJoiningDate || a.intent === "confirm");
  const concerns = analyses.flatMap((a) => a.concerns ?? []);

  let outcome = call.outcome;
  if (!outcome) outcome = status !== "completed" || answered === 0 ? "no_answer" : concerns.length ? "concerns" : confirmed ? "confirmed" : "concerns";
  const statusLine = outcome === "no_answer" ? "No answer" : outcome === "declined" ? "Asked to be called another time"
    : outcome === "callback" ? "Asked to speak with a person" : confirmed ? "Joining date confirmed" : "Joining date not confirmed on the call";
  const actions = [...new Set(concerns.map((k) => CONCERN_CATEGORIES[k.category as ConcernCategory]?.action).filter(Boolean))];
  const summary = [
    `Candidate: ${c.firstName} ${c.lastName}`.trim() + `; Joining date: ${fmtDate(c.joiningDate, { year: undefined })} (${Math.max(0, daysBetween(new Date(), c.joiningDate))} days); Status: ${statusLine}.`,
    concerns.length ? `Raised: ${concerns.map((k) => k.summary).join("; ")}.` : answered ? "Reported no other concerns." : "",
    actions.length ? `Action: ${actions.join(" ")}` : outcome === "callback" || outcome === "declined" ? "Action: Recruiter to follow up personally." : "",
  ].filter(Boolean).join(" ");

  const updated = await db.voiceCall.update({
    where: { id: callId },
    data: { status: outcome === "no_answer" && status === "completed" ? "no_answer" : outcome === "declined" ? "declined" : status, outcome, summary, endedAt: new Date() },
  });
  await logEvent(c.id, "voice_call", `Voice check-in: ${statusLine}`, "ai");
  if (outcome !== "no_answer") {
    await deliverToCandidate({ candidate: c, org: c.org, channel: "voice", author: "system", body: `📞 Voice check-in summary: ${summary}` });
  }
  await evaluateReadiness(c.id);
  return updated;
}
