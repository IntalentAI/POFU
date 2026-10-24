import type { Concern } from "@prisma/client";
import type { Reason } from "./engine/readiness";

/** The single most useful next step for a recruiter, derived from open concerns and readiness indicators. */
export function recommendAction(concerns: Pick<Concern, "severity" | "suggestedAction">[], reasons: Reason[]) {
  const top = [...concerns].sort((a, b) => (a.severity === "high" ? -1 : 0) - (b.severity === "high" ? -1 : 0))[0];
  if (top) return top.suggestedAction;
  if (reasons.some((r) => r.text.startsWith("No reply"))) return "Send a personal check-in — a short note from you often lands better than another automated message.";
  if (reasons.some((r) => r.text.startsWith("Joining date not yet confirmed"))) return "Confirm the joining date with the candidate.";
  if (reasons.some((r) => r.text.includes("opted out"))) return "Reach out personally; automated messages are off for this candidate.";
  return null;
}
