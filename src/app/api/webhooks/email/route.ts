import { NextResponse } from "next/server";
import { findCandidateByContact } from "@/lib/api-auth";
import { handleInboundMessage } from "@/lib/engine/inbound";

/**
 * Generic inbound-email webhook (SendGrid Inbound Parse, Postmark, Mailgun routes…).
 * Accepts JSON or form data with `from` and `text` fields. Protect with ?secret=INBOUND_EMAIL_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (secret && new URL(req.url).searchParams.get("secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const type = req.headers.get("content-type") ?? "";
  let from = "", text = "", id: string | undefined;
  if (type.includes("application/json")) {
    const b = (await req.json()) as Record<string, string | undefined>;
    from = b.from ?? b.From ?? b.sender ?? "";
    text = b.text ?? b.TextBody ?? b["stripped-text"] ?? b.StrippedTextReply ?? "";
    id = b.messageId ?? b.MessageID;
  } else {
    const f = await req.formData();
    from = String(f.get("from") ?? f.get("sender") ?? "");
    text = String(f.get("stripped-text") ?? f.get("text") ?? "");
  }
  const email = from.match(/[^<\s]+@[^>\s]+/)?.[0];
  // Drop quoted history from replies.
  const body = text.split(/\n(?:On .+ wrote:|-{2,}\s*Original Message|>)/)[0].trim();
  if (!email || !body) return NextResponse.json({ ok: false, reason: "missing sender or body" });
  const candidate = await findCandidateByContact({ email });
  if (!candidate) return NextResponse.json({ ok: false, reason: "unknown sender" });
  await handleInboundMessage(candidate.id, body, "email", id);
  return NextResponse.json({ ok: true });
}
