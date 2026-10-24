"use client";
import { useRef } from "react";
import { SubmitButton } from "@/components/submit-button";

const SUGGESTIONS = ["What happens on my first day?", "Is there a dress code?", "I may need to change my joining date"];

export function Composer({ action }: { action: (f: FormData) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="sticky bottom-0 border-t border-zinc-100 bg-white px-4 py-3">
      <div className="mb-2 flex gap-1.5 overflow-x-auto">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => { if (input.current) { input.current.value = s; input.current.focus(); } }}
            className="shrink-0 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50">{s}</button>
        ))}
      </div>
      <form ref={form} action={async (f) => { await action(f); form.current?.reset(); }} className="flex gap-2">
        <input ref={input} name="body" required autoComplete="off" placeholder="Ask anything about joining…" className="input rounded-full px-4" />
        <SubmitButton className="btn-primary rounded-full px-4" pendingText="…">Send</SubmitButton>
      </form>
    </div>
  );
}
