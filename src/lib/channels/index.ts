import nodemailer, { type Transporter } from "nodemailer";

export type OutboundChannel = "whatsapp" | "email" | "sms" | "web";
export type SendResult = { delivery: "sent" | "simulated" | "failed"; externalId?: string; error?: string };

type SendInput = {
  channel: OutboundChannel;
  to: { email?: string | null; phone?: string | null };
  subject?: string | null;
  body: string;
  fromName: string;
};

/** Pick a deliverable channel, honouring the candidate's preference. */
export function resolveChannel(preferred: string, c: { email?: string | null; phone?: string | null }): OutboundChannel {
  if ((preferred === "whatsapp" || preferred === "sms") && c.phone) return preferred;
  if (preferred === "email" && c.email) return "email";
  if (c.phone) return "whatsapp";
  if (c.email) return "email";
  return "web";
}

export async function sendMessage(input: SendInput): Promise<SendResult> {
  try {
    switch (input.channel) {
      case "email": return await sendEmail(input);
      case "whatsapp": return await sendWhatsApp(input);
      case "sms": return await sendSms(input);
      default: return { delivery: "sent" }; // web: shown on the candidate's joining page
    }
  } catch (err) {
    console.error(`[channel:${input.channel}] send failed`, err);
    return { delivery: "failed", error: (err as Error).message };
  }
}

let transport: Transporter | null = null;
async function sendEmail({ to, subject, body, fromName }: SendInput): Promise<SendResult> {
  if (!to.email) return { delivery: "failed", error: "Candidate has no email address" };
  if (!process.env.SMTP_URL) return { delivery: "simulated" };
  transport ??= nodemailer.createTransport(process.env.SMTP_URL);
  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM || `${fromName} <no-reply@intalent.ai>`,
    to: to.email,
    subject: subject || `A message from ${fromName}`,
    text: body,
  });
  return { delivery: "sent", externalId: info.messageId };
}

async function twilioSend(from: string, toAddr: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ From: from, To: toAddr, Body: body }),
  });
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) return { delivery: "failed", error: json.message || `Twilio ${res.status}` };
  return { delivery: "sent", externalId: json.sid };
}

async function sendWhatsApp({ to, body }: SendInput): Promise<SendResult> {
  if (!to.phone) return { delivery: "failed", error: "Candidate has no phone number" };
  if (process.env.WHATSAPP_CLOUD_TOKEN && process.env.WHATSAPP_CLOUD_PHONE_ID) {
    // Meta WhatsApp Cloud API. Note: outside the 24h customer-service window Meta requires
    // pre-approved message templates; configure those in Meta Business Manager.
    const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_CLOUD_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.phone.replace(/[^\d]/g, ""), type: "text", text: { body } }),
    });
    const json = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
    if (!res.ok) return { delivery: "failed", error: json.error?.message || `WhatsApp ${res.status}` };
    return { delivery: "sent", externalId: json.messages?.[0]?.id };
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_WHATSAPP_FROM) {
    return twilioSend(process.env.TWILIO_WHATSAPP_FROM, `whatsapp:${to.phone}`, body);
  }
  return { delivery: "simulated" };
}

async function sendSms({ to, body }: SendInput): Promise<SendResult> {
  if (!to.phone) return { delivery: "failed", error: "Candidate has no phone number" };
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_SMS_FROM) {
    return twilioSend(process.env.TWILIO_SMS_FROM, to.phone, body);
  }
  return { delivery: "simulated" };
}

export function channelStatus() {
  return {
    email: process.env.SMTP_URL ? "SMTP" : null,
    whatsapp: process.env.WHATSAPP_CLOUD_TOKEN ? "Meta Cloud API" : process.env.TWILIO_WHATSAPP_FROM ? "Twilio" : null,
    sms: process.env.TWILIO_SMS_FROM ? "Twilio" : null,
    ai: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_MODEL || "claude-opus-5-5" : null,
  };
}
