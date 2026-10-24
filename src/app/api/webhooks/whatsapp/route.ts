import crypto from "node:crypto";
import { findCandidateByContact } from "@/lib/api-auth";
import { handleInboundMessage } from "@/lib/engine/inbound";

/** Meta WhatsApp Cloud API webhook: verification handshake. */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(p.get("hub.challenge") ?? "");
  }
  return new Response("Forbidden", { status: 403 });
}

type MetaPayload = { entry?: { changes?: { value?: { messages?: { from: string; id: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string } } }[] } }[] }[] };

export async function POST(req: Request) {
  const raw = await req.text();
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(raw).digest("hex");
    const given = req.headers.get("x-hub-signature-256") ?? "";
    if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      return new Response("Invalid signature", { status: 403 });
    }
  }
  const payload = JSON.parse(raw || "{}") as MetaPayload;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title;
        if (!text) continue;
        const candidate = await findCandidateByContact({ phone: m.from });
        if (candidate) await handleInboundMessage(candidate.id, text, "whatsapp", m.id);
      }
    }
  }
  return new Response("ok");
}
