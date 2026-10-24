import Link from "next/link";
import { READINESS_LABEL, STATUS_LABEL } from "@/lib/constants";
import type { Reason } from "@/lib/engine/readiness";

const READINESS_STYLE: Record<string, string> = {
  on_track: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  needs_attention: "bg-amber-50 text-amber-800 ring-amber-200",
  intervention_required: "bg-red-50 text-red-700 ring-red-200",
};
const READINESS_DOT: Record<string, string> = {
  on_track: "bg-emerald-500", needs_attention: "bg-amber-500", intervention_required: "bg-red-500",
};

export function ReadinessBadge({ readiness, status }: { readiness: string; status?: string }) {
  if (status && status !== "pre_joining") {
    const style = status === "joined" ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200";
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>{STATUS_LABEL[status]}</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${READINESS_STYLE[readiness]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${READINESS_DOT[readiness]}`} />
      {READINESS_LABEL[readiness]}
    </span>
  );
}

export function ReadinessDot({ readiness }: { readiness: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${READINESS_DOT[readiness] ?? "bg-zinc-400"}`} />;
}

const TONE: Record<Reason["tone"], string> = {
  positive: "text-emerald-600", info: "text-zinc-400", warning: "text-amber-600", danger: "text-red-600",
};
const ICON: Record<Reason["tone"], string> = { positive: "✓", info: "•", warning: "!", danger: "!!" };

export function ReasonList({ reasons, compact }: { reasons: Reason[]; compact?: boolean }) {
  return (
    <ul className={compact ? "space-y-0.5" : "space-y-1.5"}>
      {reasons.map((r, i) => (
        <li key={i} className="flex gap-2 text-sm text-zinc-700">
          <span className={`w-4 shrink-0 text-center font-bold ${TONE[r.tone]}`}>{ICON[r.tone]}</span>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function StatCard({ label, value, hint, href, tone }: { label: string; value: string | number; hint?: string; href?: string; tone?: "danger" | "warning" | "good" }) {
  const color = tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-zinc-900";
  const inner = (
    <div className="card h-full p-4 transition hover:border-zinc-300">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-zinc-500">{children}</div>;
}

export function ChannelTag({ channel }: { channel: string }) {
  const label: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", sms: "SMS", web: "Joining page" };
  return <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600">{label[channel] ?? channel}</span>;
}
