// Runs the engagement scheduler inside the server process (dev / single-instance hosting).
// For serverless or multi-instance deployments, disable this and call /api/cron/tick instead.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startInternalScheduler } = await import("./lib/engine/internal-scheduler");
    startInternalScheduler();
  }
}
