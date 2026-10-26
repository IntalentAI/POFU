import { db } from "@/lib/db";
import { fileResponse, verifyFileLink } from "@/lib/storage";

/** Signed, expiring document links included in the onboarding handoff webhook (for HRIS import). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  if (!verifyFileLink(id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return new Response("Link invalid or expired", { status: 403 });
  }
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return new Response("Not found", { status: 404 });
  return fileResponse(doc.storageKey, { fileName: doc.fileName, contentType: doc.contentType });
}
