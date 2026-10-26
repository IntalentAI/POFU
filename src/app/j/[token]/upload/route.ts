import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkOnboardingReady } from "@/lib/checklist";
import { evaluateReadiness } from "@/lib/engine/readiness";
import { logEvent } from "@/lib/events";
import { checkUpload, putFile, storageKey } from "@/lib/storage";

/** Candidate uploads a document for a checklist item from their joining page. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const candidate = await db.candidate.findUnique({ where: { portalToken: token } });
  if (!candidate || candidate.status !== "pre_joining") return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });

  const form = await req.formData();
  const item = await db.checklistItem.findFirst({ where: { id: String(form.get("itemId") ?? ""), candidateId: candidate.id } });
  if (!item || !item.allowUpload) return NextResponse.json({ error: "This item doesn't accept uploads." }, { status: 400 });
  if (item.status === "verified" || item.status === "waived") return NextResponse.json({ error: "This item is already complete." }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  const problem = checkUpload(file, "document");
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const key = storageKey("documents", candidate.id, file.name);
  await putFile(key, file);
  await db.document.create({
    data: { candidateId: candidate.id, checklistItemId: item.id, storageKey: key, fileName: file.name.slice(0, 200), contentType: file.type.split(";")[0], size: file.size },
  });
  await db.checklistItem.update({ where: { id: item.id }, data: { status: "submitted", submittedAt: new Date(), note: null } });
  await logEvent(candidate.id, "document_submitted", `Uploaded ${item.title}`, "candidate");
  await checkOnboardingReady(candidate.id);
  await evaluateReadiness(candidate.id);
  return NextResponse.json({ ok: true });
}
