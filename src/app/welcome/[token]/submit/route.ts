import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { onWelcomeReceived } from "@/lib/engine/welcome";
import { checkUpload, deleteFile, putFile, storageKey } from "@/lib/storage";

/** Hiring manager submits their welcome (text, or a recorded video/audio clip). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const welcome = await db.welcomeMessage.findUnique({ where: { token }, include: { candidate: true } });
  if (!welcome || welcome.status === "delivered" || welcome.candidate.status !== "pre_joining") {
    return NextResponse.json({ error: "This link is no longer active." }, { status: 404 });
  }
  const form = await req.formData();
  const kind = String(form.get("kind") ?? "");
  const text = String(form.get("text") ?? "").trim().slice(0, 2000);
  const file = form.get("file");

  let storage: { key: string; type: string } | null = null;
  if (kind === "text") {
    if (text.length < 5) return NextResponse.json({ error: "Write a few words first." }, { status: 400 });
  } else if (kind === "video" || kind === "audio") {
    if (!(file instanceof File)) return NextResponse.json({ error: "Record a message first." }, { status: 400 });
    const problem = checkUpload(file, "media");
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    storage = { key: storageKey("welcomes", welcome.candidateId, `${kind}.${file.type.includes("mp4") ? "mp4" : "webm"}`), type: file.type.split(";")[0] };
    await putFile(storage.key, file);
  } else {
    return NextResponse.json({ error: "Unknown message type." }, { status: 400 });
  }

  if (welcome.storageKey && welcome.storageKey !== storage?.key) await deleteFile(welcome.storageKey).catch(() => null);
  await db.welcomeMessage.update({
    where: { id: welcome.id },
    data: { kind, text: text || null, storageKey: storage?.key ?? null, contentType: storage?.type ?? null, status: "received", receivedAt: new Date() },
  });
  await onWelcomeReceived(welcome.id);
  return NextResponse.json({ ok: true });
}
