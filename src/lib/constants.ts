export const CHANNELS = ["whatsapp", "email", "sms"] as const;
export type Channel = (typeof CHANNELS)[number] | "web";

export const CANDIDATE_STATUSES = ["pre_joining", "joined", "dropped", "offer_rescinded"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const READINESS = ["on_track", "needs_attention", "intervention_required"] as const;
export type Readiness = (typeof READINESS)[number];

export const READINESS_LABEL: Record<string, string> = {
  on_track: "On track",
  needs_attention: "Needs attention",
  intervention_required: "Intervention required",
};

export const STATUS_LABEL: Record<string, string> = {
  pre_joining: "Pre-joining",
  joined: "Joined",
  dropped: "Did not join",
  offer_rescinded: "Offer rescinded",
};

// Concern categories, the AI's role and who owns follow-up (spec §6).
export const CONCERN_CATEGORIES = {
  competing_offer: { label: "Competing offer", owner: "recruiter", severity: "high", action: "Arrange a recruiter conversation to understand the competing offer." },
  counteroffer: { label: "Counteroffer", owner: "recruiter", severity: "high", action: "Schedule a recruiter call to discuss the counteroffer." },
  salary: { label: "Compensation clarification", owner: "recruiter", severity: "medium", action: "Recruiter/HR to clarify offer details. The AI does not negotiate." },
  joining_date_change: { label: "Joining date change", owner: "recruiter", severity: "medium", action: "Review the requested date and approve or discuss a revised date." },
  relocation: { label: "Relocation / logistics", owner: "hr_ops", severity: "medium", action: "Share relocation and travel details with the candidate." },
  manager: { label: "Manager concerns", owner: "recruiter", severity: "medium", action: "Arrange a confidential discussion." },
  documentation: { label: "Documentation issue", owner: "hr_ops", severity: "low", action: "HR operations to explain or resolve the document requirement." },
  personal: { label: "Personal circumstances", owner: "recruiter", severity: "medium", action: "Reach out with flexibility and support; involve the right HR contact." },
  reconsidering: { label: "Reconsidering the offer", owner: "recruiter", severity: "high", action: "Call the candidate today to understand what has changed." },
  withdrawal: { label: "Withdrawal", owner: "recruiter", severity: "high", action: "Confirm the candidate's intent and record the reason." },
  unanswered_question: { label: "Unanswered question", owner: "recruiter", severity: "low", action: "Answer the candidate's question (consider adding it to the knowledge base)." },
  other: { label: "Other", owner: "recruiter", severity: "low", action: "Review the conversation and follow up." },
} as const;
export type ConcernCategory = keyof typeof CONCERN_CATEGORIES;

export const OWNER_LABEL: Record<string, string> = {
  recruiter: "Recruiter",
  hr_ops: "HR operations",
  hiring_manager: "Hiring manager",
};

export const DROPOUT_REASONS = [
  "Better competing offer",
  "Counteroffer from current employer",
  "Compensation concerns",
  "Relocation issues",
  "Joining-date conflicts",
  "Personal circumstances",
  "No response / unreachable",
  "Other",
] as const;

export const WEBHOOK_EVENTS = [
  "candidate.enrolled",
  "candidate.confirmed",
  "candidate.readiness_changed",
  "candidate.joining_date_changed",
  "candidate.status_changed",
  "concern.raised",
  "concern.resolved",
] as const;
