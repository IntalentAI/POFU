import crypto from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Private file storage (R2 bucket bound as FILES). Files are never public: they are
// streamed through routes that check a session, a portal token or a signed link.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];
const MEDIA_TYPES = ["video/webm", "video/mp4", "video/quicktime", "audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"];

export function bucket(): R2Bucket {
  const files = getCloudflareContext().env.FILES;
  if (!files) throw new Error("File storage (R2 binding FILES) is not configured");
  return files;
}

/** Validate an uploaded file. Returns an error message, or null if acceptable. */
export function checkUpload(file: File, kind: "document" | "media"): string | null {
  if (!file || !file.size) return "Choose a file to upload.";
  if (file.size > MAX_UPLOAD_BYTES) return "Files must be 10 MB or smaller.";
  const type = (file.type || "").split(";")[0].toLowerCase();
  const allowed = kind === "document" ? DOCUMENT_TYPES : MEDIA_TYPES;
  if (!allowed.includes(type)) {
    return kind === "document" ? "Upload a PDF or an image (JPG, PNG, HEIC)." : "Unsupported recording format.";
  }
  return null;
}

export function storageKey(prefix: string, ownerId: string, fileName: string) {
  const safe = fileName.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(-60) || "file";
  return `${prefix}/${ownerId}/${crypto.randomBytes(8).toString("hex")}-${safe}`;
}

export async function putFile(key: string, file: File) {
  await bucket().put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: (file.type || "application/octet-stream").split(";")[0] },
  });
}

/** Stream a stored file as an HTTP response (private, never cached by shared caches). */
export async function fileResponse(key: string, opts: { fileName?: string; inline?: boolean; contentType?: string }) {
  const obj = await bucket().get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "content-type": opts.contentType || obj.httpMetadata?.contentType || "application/octet-stream",
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
  if (opts.fileName) {
    headers.set("content-disposition", `${opts.inline ? "inline" : "attachment"}; filename="${opts.fileName.replace(/["\r\n]/g, "")}"`);
  }
  return new Response(obj.body, { headers });
}

export async function deleteFile(key: string) {
  await bucket().delete(key);
}

// Signed, expiring links let an HRIS pull documents without a session (onboarding handoff).
function signingKey() {
  return process.env.AUTH_SECRET || "dev-only-change-me-please-32-chars-min";
}

export function signFileLink(documentId: string, ttlSeconds = 86400) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto.createHmac("sha256", signingKey()).update(`${documentId}.${exp}`).digest("base64url");
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/api/files/${documentId}?exp=${exp}&sig=${sig}`;
}

export function verifyFileLink(documentId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig || Number(exp) * 1000 < Date.now()) return false;
  const expected = crypto.createHmac("sha256", signingKey()).update(`${documentId}.${exp}`).digest("base64url");
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}
