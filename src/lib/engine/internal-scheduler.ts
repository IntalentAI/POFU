import { runDueEngagements } from "./dispatcher";

const g = globalThis as unknown as { __jaScheduler?: NodeJS.Timeout };

export function startInternalScheduler() {
  if (process.env.ENABLE_INTERNAL_SCHEDULER !== "true" || g.__jaScheduler) return;
  let ticks = 0;
  const tick = async () => {
    try {
      // Full readiness sweep hourly; due engagements every minute.
      const r = await runDueEngagements(new Date(), { sweepReadiness: ticks++ % 60 === 0 });
      if (r.processed) console.log("[scheduler]", r);
    } catch (err) {
      console.error("[scheduler] tick failed", err);
    }
  };
  setTimeout(tick, 5_000);
  g.__jaScheduler = setInterval(tick, 60_000);
}
