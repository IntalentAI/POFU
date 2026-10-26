import { finishCall } from "@/lib/engine/voice";
import { validTwilioRequest } from "@/lib/twilio";

/** Twilio call status callback: records unanswered/failed calls and closes the summary. */
export async function POST(req: Request) {
  const params = new URLSearchParams(await req.text());
  if (!validTwilioRequest(req, params)) return new Response("Invalid signature", { status: 403 });
  const callId = new URL(req.url).searchParams.get("call") ?? "";
  const status = params.get("CallStatus") ?? "completed"; // completed | busy | no-answer | failed | canceled
  const mapped = status === "completed" ? "completed" : status === "failed" ? "failed" : "no_answer";
  await finishCall(callId, mapped).catch(() => null);
  return new Response("ok");
}
