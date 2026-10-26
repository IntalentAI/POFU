import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fileResponse } from "@/lib/storage";

/** Recruiter access to a candidate document or welcome recording (same workspace only). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const doc = await db.document.findFirst({ where: { id, candidate: { orgId: user.orgId } } });
  if (doc) return fileResponse(doc.storageKey, { fileName: doc.fileName, inline, contentType: doc.contentType });
  const welcome = await db.welcomeMessage.findFirst({ where: { id, candidate: { orgId: user.orgId }, storageKey: { not: null } } });
  if (welcome?.storageKey) return fileResponse(welcome.storageKey, { contentType: welcome.contentType ?? undefined });
  return new Response("Not found", { status: 404 });
}
