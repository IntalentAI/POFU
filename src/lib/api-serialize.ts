import type { Candidate, Concern } from "@prisma/client";
import { parseReasons } from "./engine/readiness";
import { portalUrl } from "./engine/template";

export function serializeCandidate(c: Candidate & { concerns?: Concern[] }) {
  return {
    id: c.id, externalId: c.externalId, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone,
    preferredChannel: c.preferredChannel, position: c.position, department: c.department, location: c.location,
    hiringManagerName: c.hiringManagerName, offerAcceptedAt: c.offerAcceptedAt, joiningDate: c.joiningDate.toISOString().slice(0, 10),
    originalJoiningDate: c.originalJoiningDate.toISOString().slice(0, 10), status: c.status, readiness: c.readiness,
    readinessReasons: parseReasons(c.readinessReasons), lastConfirmedAt: c.lastConfirmedAt, dropoutReason: c.dropoutReason,
    joiningPageUrl: portalUrl(c.portalToken),
    openConcerns: c.concerns?.filter((k) => k.status === "open").map((k) => ({ id: k.id, category: k.category, severity: k.severity, summary: k.summary, createdAt: k.createdAt })),
  };
}
