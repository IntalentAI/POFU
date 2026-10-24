"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Command Center", icon: "◎" },
  { href: "/candidates", label: "Candidates", icon: "☰" },
  { href: "/calendar", label: "Joining Calendar", icon: "▦" },
  { href: "/analytics", label: "Analytics", icon: "▤" },
  { href: "/campaigns", label: "Engagement Journeys", icon: "↻" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Nav({ attention }: { attention: number }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 lg:flex-col lg:overflow-visible">
      {ITEMS.map((item) => {
        const active = path === item.href || path.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-brand-50 text-brand-700" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            <span className="w-4 text-center text-base leading-none opacity-70">{item.icon}</span>
            <span>{item.label}</span>
            {item.href === "/dashboard" && attention > 0 && (
              <span className="ml-auto rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-700">{attention}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
