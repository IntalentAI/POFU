import { z } from "zod";

export const CONCERN_KEYS = [
  "competing_offer", "counteroffer", "salary", "joining_date_change", "relocation", "manager",
  "documentation", "personal", "reconsidering", "withdrawal", "unanswered_question", "other",
] as const;

export const InterpretationSchema = z.object({
  intent: z.enum(["confirm", "arrived", "question", "concern", "date_change", "reconsidering", "withdraw", "opt_out", "small_talk"]),
  confirmsJoiningDate: z.boolean().describe("Candidate explicitly confirms they still plan to join on the scheduled date"),
  concerns: z.array(z.object({
    category: z.enum(CONCERN_KEYS),
    summary: z.string().describe("One sentence for the recruiter, e.g. 'Requested a two-week joining-date extension'"),
  })),
  requestedJoiningDate: z.string().nullable().describe("YYYY-MM-DD if the candidate asked for a specific new joining date, else null"),
  answeredFromKnowledge: z.boolean().describe("True only if the reply answers the question using the approved knowledge"),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  reply: z.string().describe("The message to send back to the candidate"),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

export type ConversationContext = {
  company: string;
  companion: string;
  candidate: { firstName: string; position: string; joiningDate: Date; location: string | null; hiringManagerName: string | null; recruiterName: string | null };
  knowledge: { question: string; answer: string; category?: string }[];
  language: string; // candidate's preferred language code, e.g. "en", "es"
  // Confirmed, candidate-specific facts the companion may state (first day, checklist status).
  details: { firstDayTime: string; firstDayAddress: string | null; firstDayNotes: string | null };
  checklist: { title: string; status: string; required: boolean; dueDate: Date | null; category?: string; allowUpload?: boolean }[];
  history: { direction: string; author: string; body: string }[];
  lastPromptKind: string | null; // kind of the most recent scheduled engagement (pulse | arrival | message)
  now: Date;
};
