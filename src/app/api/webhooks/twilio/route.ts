import { validTwilioRequest } from "@/lib/twilio";
import { findCandidateByContact } from "@/lib/api-auth";
import { handleInboundMessage } from "@/lib/engine/inbound";

/** Twilio inbound webhook for WhatsApp and SMS. Replies are sent via the REST API, so we return empty TwiML. */
export async function POST(req: Request) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  if (!validTwilioRequest(req, params)) return new Response("Invalid signature", { status: 403 });
  const from = params.get("From") ?? "";
  const body = params.get("Body") ?? "";
  const candidate = await findCandidateByContact({ phone: from.replace(/^whatsapp:/, "") });
  if (candidate && body.trim()) {
    await handleInboundMessage(candidate.id, body, from.startsWith("whatsapp:") ? "whatsapp" : "sms", params.get("MessageSid") ?? undefined);
  }
  return new Response("<Response></Response>", { headers: { "content-type": "text/xml" } });
}
