import crypto from "node:crypto";
import { db } from "./db";

/** Deliver an event to the org's registered webhooks (fire-and-forget, HMAC-SHA256 signed). */
export async function emitWebhook(orgId: string, event: string, data: Record<string, unknown>) {
  const hooks = await db.webhook.findMany({ where: { orgId, active: true } });
  const body = JSON.stringify({ event, createdAt: new Date().toISOString(), data });
  await Promise.all(
    hooks
      .filter((h) => h.events === "*" || h.events.split(",").map((e) => e.trim()).includes(event))
      .map(async (h) => {
        const signature = crypto.createHmac("sha256", h.secret).update(body).digest("hex");
        try {
          await fetch(h.url, {
            method: "POST",
            headers: { "content-type": "application/json", "x-intalent-event": event, "x-intalent-signature": `sha256=${signature}` },
            body,
            signal: AbortSignal.timeout(5000),
          });
        } catch (err) {
          console.warn(`[webhook] delivery to ${h.url} failed:`, (err as Error).message);
        }
      }),
  );
}
