"use client";
import { useEffect, useRef, useState } from "react";

type Mode = "video" | "audio" | "text";
const MAX_SECONDS = 60;

export function Recorder({ token, firstName }: { token: string; firstName: string }) {
  const [mode, setMode] = useState<Mode>("video");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const live = useRef<HTMLVideoElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStream = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => () => { stopStream(); if (timer.current) clearInterval(timer.current); }, []);

  async function start() {
    setError(""); setBlob(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia(mode === "video" ? { video: { width: 640 }, audio: true } : { audio: true });
    } catch {
      setError("We couldn't access your camera or microphone. Check your browser permissions, or write a message instead.");
      return;
    }
    if (mode === "video" && live.current) { live.current.srcObject = stream.current; live.current.play().catch(() => {}); }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream.current);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      setBlob(new Blob(chunks, { type: rec.mimeType || (mode === "video" ? "video/webm" : "audio/webm") }));
      stopStream();
      if (live.current) live.current.srcObject = null;
    };
    recorder.current = rec;
    rec.start();
    setRecording(true); setSeconds(0);
    timer.current = setInterval(() => setSeconds((s) => {
      if (s + 1 >= MAX_SECONDS) stop();
      return s + 1;
    }), 1000);
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false);
  }

  async function submit() {
    setStatus("sending"); setError("");
    const form = new FormData();
    form.set("kind", mode);
    if (mode === "text") form.set("text", text);
    else if (blob) form.set("file", new File([blob], `${mode}.webm`, { type: blob.type }));
    const res = await fetch(`/welcome/${token}/submit`, { method: "POST", body: form });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) setStatus("done");
    else { setStatus("error"); setError(json.error ?? "Something went wrong. Please try again."); }
  }

  if (status === "done") {
    return <p className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">Thank you! {firstName} will see your welcome on their joining page. 🎉</p>;
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm">
        {(["video", "audio", "text"] as Mode[]).map((m) => (
          <button key={m} type="button" disabled={recording} onClick={() => { setMode(m); setBlob(null); setError(""); }}
            className={`flex-1 rounded-md px-3 py-1.5 font-medium ${mode === m ? "bg-white shadow-sm" : "text-zinc-600"}`}>
            {m === "video" ? "🎥 Video" : m === "audio" ? "🎙 Voice" : "✍️ Write"}
          </button>
        ))}
      </div>

      {mode === "text" ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} className="input"
          placeholder={`Hi ${firstName}, we're so glad you're joining us…`} />
      ) : (
        <div className="space-y-3">
          {mode === "video" && <video ref={live} muted playsInline className={`w-full rounded-lg bg-zinc-900 ${recording ? "" : "hidden"}`} />}
          {blob && !recording && (mode === "video"
            ? <video src={URL.createObjectURL(blob)} controls className="w-full rounded-lg" />
            : <audio src={URL.createObjectURL(blob)} controls className="w-full" />)}
          {recording ? (
            <button type="button" onClick={stop} className="btn-danger w-full">■ Stop ({MAX_SECONDS - seconds}s left)</button>
          ) : (
            <button type="button" onClick={start} className="btn-secondary w-full">{blob ? "Record again" : `● Start recording (up to ${MAX_SECONDS}s)`}</button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="button" onClick={submit} disabled={status === "sending" || recording || (mode === "text" ? text.trim().length < 5 : !blob)} className="btn-primary w-full">
        {status === "sending" ? "Sending…" : `Send to ${firstName}`}
      </button>
    </div>
  );
}
