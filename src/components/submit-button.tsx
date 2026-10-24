"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn-primary", pendingText, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} {...rest}>
      {pending ? pendingText ?? "Working…" : children}
    </button>
  );
}
