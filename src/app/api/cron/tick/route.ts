import { NextResponse } from "next/server";
import { runDueEngagements } from "@/lib/engine/dispatcher";

/**
 * Engagement scheduler entry point. On Cloudflare the Worker's Cron Trigger calls this
 * in-process (see worker.ts); it can also be called externally with the bearer secret.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET || process.env.AUTH_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || given !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sweep = new URL(req.url).searchParams.get("sweep") === "1";
  return NextResponse.json(await runDueEngagements(new Date(), { sweepReadiness: sweep }));
}
export const GET = handle;
export const POST = handle;
