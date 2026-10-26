import type { Candidate, Organization } from "@prisma/client";
import { db } from "../db";
import { daysBetween, fmtDate } from "../dates";
import { logEvent } from "../events";
import { sendMessage } from "../channels";
import { deliverToCandidate } from "./outbound";
import { render, templateVars } from "./template";

const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
export const welcomeRecordUrl = (token: string) => `${appUrl()}/welcome/${token}`;

/**
 * Ask the hiring manager for a short welcome (brief §4: "Sarah joins in three weeks.
 * Would you like to record a 30-second welcome message?"). The AI handles coordination;
 * the human relationship builds commitment.
 */
export async function requestWelcome(candidate: Candidate, org: Organization, opts: { actor: string; reminder?: boolean }) {
  if (!candidate.hiringManagerEmail) return { ok: false as const, reason: "No hiring manager email on file" };
  let welcome = await db.welcomeMessage.findFirst({
    where: { candidateId: candidate.id, status: "requested" },
    orderBy: { requestedAt: "desc" },
  });
  if (!welcome) {
    welcome = await db.welcomeMessage.create({
      data: { candidateId: candidate.id, authorName: candidate.hiringManagerName || "Hiring manager", authorEmail: candidate.hiringManagerEmail },
    });
  }
  const days = daysBetween(new Date(), candidate.joiningDate);
  const when = days > 1 ? `joins in ${days} days (${fmtDate(candidate.joiningDate, { weekday: "long", month: "long", day: "numeric", year: undefined })})` : "joins very soon";
  const name = `${candidate.firstName} ${candidate.lastName}`.trim();
  const body = [
    `Hi ${candidate.hiringManagerName?.split(" ")[0] || "there"},`,
    "",
    `${name} ${when} as ${candidate.position}. Would you like to record a 30-second welcome?`,
    "Candidates who hear from their future manager before Day 1 feel much more connected to the team.",
    "",
    `Record a short video or voice note, or write a few lines (takes a minute, no login needed):`,
    welcomeRecordUrl(welcome.token),
    "",
    `— ${org.companionName}, ${org.name}'s joining assistant`,
  ].join("\n");
  const result = await sendMessage({
    channel: "email", to: { email: candidate.hiringManagerEmail },
    subject: `${opts.reminder ? "Reminder: " : ""}${candidate.firstName} ${when.startsWith("joins in") ? when.split(" (")[0] : "joins soon"}. Record a quick welcome?`,
    body, fromName: `${org.companionName} at ${org.name}`,
  });
  await db.welcomeMessage.update({ where: { id: welcome.id }, data: opts.reminder ? { remindedAt: new Date() } : { requestedAt: new Date() } });
  await logEvent(candidate.id, "welcome_requested",
    `${opts.reminder ? "Reminded" : "Asked"} ${welcome.authorName} to record a welcome${result.delivery === "failed" ? ` (email failed: ${result.error})` : result.delivery === "simulated" ? " (email simulated)" : ""}`,
    opts.actor);
  return { ok: result.delivery !== "failed", reason: result.error ?? "Requested", welcome };
}

/**
 * The manager submitted a welcome. If the journey still has a welcome touchpoint ahead it
 * goes out then; otherwise (or if that step already passed) the candidate is told now.
 */
export async function onWelcomeReceived(welcomeId: string) {
  const w = await db.welcomeMessage.findUniqueOrThrow({ where: { id: welcomeId }, include: { candidate: { include: { org: true } } } });
  const c = w.candidate;
  await logEvent(c.id, "welcome_received", `${w.authorName} recorded a ${w.kind} welcome`, w.authorName);
  if (c.status !== "pre_joining") return;
  const upcoming = await db.scheduledMessage.findFirst({
    where: { candidateId: c.id, status: "scheduled", step: { kind: "welcome" } },
  });
  if (upcoming) return; // the journey's welcome step will deliver it
  const vars = templateVars({ candidate: c, org: c.org });
  const { result } = await deliverToCandidate({
    candidate: c, org: c.org, author: "ai",
    subject: render("A welcome message from {{hiringManager}}", { ...vars, hiringManager: w.authorName }),
    body: render(`Hi {{firstName}}, ${w.authorName} recorded a welcome message for you ahead of your first day. You can ${w.kind === "text" ? "read" : "watch"} it on your joining page: {{portalLink}}`, vars),
  });
  if (result.delivery !== "failed") {
    await db.welcomeMessage.update({ where: { id: w.id }, data: { status: "delivered", deliveredAt: new Date() } });
  }
}
