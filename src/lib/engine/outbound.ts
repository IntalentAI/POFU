import type { Candidate, Organization } from "@prisma/client";
import { db } from "../db";
import { resolveChannel, sendMessage, type OutboundChannel } from "../channels";

type Author = "ai" | "recruiter" | "system";

/** Send a message to a candidate on their preferred channel and record it in the conversation. */
export async function deliverToCandidate(opts: {
  candidate: Candidate; org: Organization; body: string; subject?: string | null;
  author: Author; authorName?: string; channel?: OutboundChannel;
}) {
  const { candidate, org } = opts;
  const channel = opts.channel ?? resolveChannel(candidate.preferredChannel, candidate);
  const result = await sendMessage({
    channel, to: candidate, subject: opts.subject, body: opts.body,
    fromName: opts.author === "recruiter" && opts.authorName ? `${opts.authorName} (${org.name})` : `${org.companionName} at ${org.name}`,
  });
  const message = await db.message.create({
    data: {
      candidateId: candidate.id, direction: "outbound", channel, author: opts.author,
      authorName: opts.authorName ?? (opts.author === "ai" ? org.companionName : undefined),
      subject: opts.subject, body: opts.body, delivery: result.delivery, externalId: result.externalId,
      analysis: result.error ? JSON.stringify({ error: result.error }) : undefined,
    },
  });
  if (result.delivery !== "failed") {
    await db.candidate.update({ where: { id: candidate.id }, data: { lastOutboundAt: new Date() } });
  }
  return { message, result };
}
