import { daysBetween, fmtDate } from "../dates";

export type TemplateContext = {
  candidate: {
    firstName: string; lastName: string; position: string; joiningDate: Date;
    location: string | null; hiringManagerName: string | null; portalToken: string;
  };
  org: { name: string; companionName: string };
  now?: Date;
};

export function portalUrl(token: string) {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}/j/${token}`;
}

export function templateVars({ candidate, org, now = new Date() }: TemplateContext): Record<string, string> {
  return {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    company: org.name,
    companion: org.companionName,
    position: candidate.position,
    joiningDate: fmtDate(candidate.joiningDate, { weekday: "long", month: "long", day: "numeric", year: undefined }),
    daysToJoin: String(Math.max(0, daysBetween(now, candidate.joiningDate))),
    location: candidate.location || "our office",
    hiringManager: candidate.hiringManagerName || "your manager",
    portalLink: portalUrl(candidate.portalToken),
  };
}

export function render(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => (key in vars ? vars[key] : m));
}

export const TEMPLATE_VARIABLES = [
  "firstName", "lastName", "company", "companion", "position", "joiningDate",
  "daysToJoin", "location", "hiringManager", "portalLink",
];
