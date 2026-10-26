import { db } from "@/lib/db";
import { callOpening, finishCall, voiceTurn } from "@/lib/engine/voice";
import { gather, say, twiml, validTwilioRequest } from "@/lib/twilio";

/** TwiML for an AI voice check-in: opening, each answered turn, and silence handling. */
export async function POST(req: Request) {
  const params = new URLSearchParams(await req.text());
  if (!validTwilioRequest(req, params)) return new Response("Invalid signature", { status: 403 });
  const url = new URL(req.url);
  const callId = url.searchParams.get("call") ?? "";
  const step = url.searchParams.get("step") ?? "start";
  const call = await db.voiceCall.findUnique({ where: { id: callId } });
  if (!call || call.endedAt) return twiml("<Hangup/>");

  const base = `${url.origin}${url.pathname}?call=${callId}`;
  const listen = (text: string, misses = 0) =>
    twiml(gather(text, `${base}&step=turn`) + `<Redirect method="POST">${base}&amp;step=silence&amp;n=${misses + 1}</Redirect>`);

  if (step === "start") return listen(await callOpening(callId));

  if (step === "silence") {
    const n = Number(url.searchParams.get("n") ?? 1);
    if (n >= 2) {
      await finishCall(callId, "completed");
      return twiml(say("Sorry, I couldn't hear you. We'll follow up by message instead. Goodbye!") + "<Hangup/>");
    }
    return listen("Sorry, I didn't catch that. Could you say that again?", n);
  }

  const { say: text, end } = await voiceTurn(callId, params.get("SpeechResult") ?? "");
  return end ? twiml(say(text) + "<Hangup/>") : listen(text);
}
