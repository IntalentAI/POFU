import { db } from "@/lib/db";
import { fileResponse } from "@/lib/storage";

/** Streams a hiring-manager welcome recording to the candidate it was made for. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const welcome = await db.welcomeMessage.findFirst({ where: { id, candidate: { portalToken: token }, storageKey: { not: null } } });
  if (!welcome?.storageKey) return new Response("Not found", { status: 404 });
  return fileResponse(welcome.storageKey, { contentType: welcome.contentType ?? undefined });
}
