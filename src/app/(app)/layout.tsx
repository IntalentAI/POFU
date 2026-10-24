import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { channelStatus } from "@/lib/channels";
import { Nav } from "@/components/nav";
import { Avatar } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { logout } from "../(auth)/actions";
import { runSchedulerNow } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const attention = await db.candidate.count({ where: { orgId: user.orgId, status: "pre_joining", readiness: { not: "on_track" } } });
  const channels = channelStatus();
  const simulated = !channels.whatsapp && !channels.email;
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-zinc-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="px-5 py-4">
          <div className="text-[15px] font-semibold text-brand-900">intalent</div>
          <div className="text-xs font-medium text-brand-600">Joining Assurance</div>
        </div>
        <div className="pb-2 lg:flex-1">
          <Nav attention={attention} />
        </div>
        <div className="hidden border-t border-zinc-200 p-4 lg:block">
          <div className="flex items-center gap-2">
            <Avatar name={user.name} size={28} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-zinc-500">{user.org.name}</div>
            </div>
          </div>
          <form action={logout} className="mt-2"><button className="btn-ghost w-full justify-start px-1 text-xs">Sign out</button></form>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-end gap-3 border-b border-zinc-200 bg-white/70 px-4 py-2 text-xs text-zinc-500 sm:px-8">
          {simulated && <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-800">Demo mode: messages are simulated (no WhatsApp/email provider configured)</span>}
          <span className="hidden sm:inline">AI: {channels.ai ? `Claude (${channels.ai})` : "rules engine"}</span>
          <form action={runSchedulerNow}><SubmitButton className="btn-secondary py-1 text-xs" pendingText="Running…">Run scheduler now</SubmitButton></form>
          <form action={logout} className="lg:hidden"><button className="btn-ghost py-1 text-xs">Sign out</button></form>
        </div>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
