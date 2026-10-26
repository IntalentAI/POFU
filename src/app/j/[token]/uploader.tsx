"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Upload a document for one checklist item (posts to /j/[token]/upload). */
export function Uploader({ token, itemId, label }: { token: string; itemId: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function upload(file: File) {
    setBusy(true); setError("");
    const form = new FormData();
    form.set("itemId", itemId);
    form.set("file", file);
    const res = await fetch(`/j/${token}/upload`, { method: "POST", body: form });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) { setError(json.error ?? "Upload failed. Please try again."); return; }
    router.refresh();
  }

  return (
    <div>
      <input ref={input} type="file" accept="application/pdf,image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-secondary py-1 text-xs">
        {busy ? "Uploading…" : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
