import crypto from "node:crypto";

/**
 * Validate Twilio's X-Twilio-Signature for a form-encoded webhook. Twilio signs the full
 * URL it requested plus the sorted POST parameters. Skipped when no auth token is set
 * (simulated mode).
 */
export function validTwilioRequest(req: Request, params: URLSearchParams) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return true;
  const data = req.url + [...params.keys()].sort().map((k) => k + params.get(k)).join("");
  const expected = crypto.createHmac("sha1", token).update(data).digest("base64");
  const given = req.headers.get("x-twilio-signature") ?? "";
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function twiml(xml: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`, { headers: { "content-type": "text/xml" } });
}

export const say = (text: string) => `<Say voice="Polly.Joanna-Neural">${esc(text)}</Say>`;

/** Speak `text`, then listen for the candidate's answer and post it to `action`. */
export function gather(text: string, action: string) {
  return `<Gather input="speech" action="${esc(action)}" method="POST" speechTimeout="auto" language="en-US">${say(text)}</Gather>`;
}
