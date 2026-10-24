import crypto from "node:crypto";
import { findCandidateByContact } from "@/lib/api-auth";
import { handleInboundMessage } from "@/lib/engine/inbound";

/** Twilio inbound webhook for WhatsApp and SMS. Replies are sent via the REST API, so we return empty TwiML. */
export async function POST(req: Request) {
  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const url = (process.env.APP_URL?.replace(/\/$/, "") ?? "") + "/api/webhooks/twilio";
    const data = url + [...params.keys()].sort().map((k) => k + params.get(k)).join("");
    const expected = crypto.createHmac("sha1", token).update(data).digest("base64");
    const given = req.headers.get("x-twilio-signature") ?? "";
    if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      return new Response("Invalid signature", { status: 403 });
    }
  }
  const from = params.get("From") ?? "";
  const body = params.get("Body") ?? "";
  const candidate = await findCandidateByContact({ phone: from.replace(/^whatsapp:/, "") });
  if (candidate && body.trim()) {
    await handleInboundMessage(candidate.id, body, from.startsWith("whatsapp:") ? "whatsapp" : "sms", params.get("MessageSid") ?? undefined);
  }
  return new Response("<Response></Response>", { headers: { "content-type": "text/xml" } });
}
