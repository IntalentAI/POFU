// Default engagement journey (spec §1 and §5). Steps are anchored to the offer
// acceptance date, the joining date, or a fraction of the notice period, so the
// same template adapts to a 7-day or a 90-day notice period.

// message: plain message · pulse: joining-date confirmation with quick replies
// arrival: Day-1 arrival check · welcome: delivers a hiring-manager welcome (skipped if none recorded)
// docs: reminder listing outstanding checklist items (skipped if none) · voice: AI voice check-in call
// (skipped without consent or a voice provider)
export type StepKind = "message" | "pulse" | "arrival" | "welcome" | "docs" | "voice";

export type StepTemplate = {
  key: string; name: string; objective: string;
  anchor: "after_acceptance" | "notice_percent" | "before_joining";
  offset: number; kind: StepKind; optional?: boolean;
  subject: string; body: string;
};

export const PULSE_OPTIONS = [
  "1 - Yes, everything is on track",
  "2 - I may need to change my joining date",
  "3 - I have some questions",
  "4 - I'm reconsidering the offer",
];

export const HM_WELCOME_BODY = "Hi {{firstName}}, {{hiringManager}} recorded a welcome message for you ahead of your first day. You can watch or read it on your joining page: {{portalLink}}";

export const DOCUMENTATION_BODY = "Hi {{firstName}}, as your joining date gets closer, here's what HR needs from you. You can see each item and upload securely on your joining page: {{portalLink}}. Please don't send documents in this chat. Any trouble getting something together? Let me know.";

export const DEFAULT_STEPS: StepTemplate[] = [
  {
    key: "welcome", name: "Congratulations and welcome", objective: "Establish connection",
    anchor: "after_acceptance", offset: 0, kind: "message",
    subject: "Welcome to {{company}}, {{firstName}}!",
    body: "Hi {{firstName}}! Congratulations on your offer for {{position}} at {{company}} 🎉 I'm {{companion}}, your joining companion (I'm an AI assistant working with the {{company}} hiring team). I'll keep you posted on what happens before your first day on {{joiningDate}} and help with any questions. You can reach a person on the team at any time — just ask.\n\nYour joining page: {{portalLink}}",
  },
  {
    key: "offer_clarification", name: "Offer clarification", objective: "Resolve initial questions",
    anchor: "after_acceptance", offset: 3, kind: "message", optional: true,
    subject: "Any questions about your offer?",
    body: "Hi {{firstName}}, now that you've had a few days with your offer, is there anything you'd like clarified — role, start date, benefits or anything else? Just reply here and I'll find the answer or connect you with your recruiter.",
  },
  {
    key: "transition_checkin", name: "Resignation and transition check-in", objective: "Identify early concerns",
    anchor: "after_acceptance", offset: 7, kind: "message",
    subject: "How is your transition going?",
    body: "Hi {{firstName}}, how is the transition from your current role going? If anything comes up with your resignation or notice period, let me know — we're happy to help.",
  },
  {
    key: "team_intro", name: "Team introduction", objective: "Build excitement",
    anchor: "notice_percent", offset: 25, kind: "message", optional: true,
    subject: "Meet your future team",
    body: "Hi {{firstName}}, the team is looking forward to working with you! {{hiringManager}} and the team will be your day-to-day colleagues. Want to know anything about the team or how you'll be working together? Ask away.",
  },
  {
    key: "pulse_mid", name: "Candidate pulse check", objective: "Surface concerns",
    anchor: "notice_percent", offset: 50, kind: "pulse",
    subject: "Quick check-in before {{joiningDate}}",
    body: "Hi {{firstName}}, you're about halfway to your first day at {{company}}. How are things progressing? Is {{joiningDate}} still your planned joining date? Reply with a number or in your own words:",
  },
  {
    key: "hm_message", name: "Hiring manager welcome", objective: "Strengthen connection",
    anchor: "notice_percent", offset: 40, kind: "welcome", optional: true,
    subject: "A welcome message from {{hiringManager}}",
    body: HM_WELCOME_BODY,
  },
  {
    key: "documentation", name: "Documentation check", objective: "Ensure readiness",
    anchor: "before_joining", offset: 20, kind: "message",
    subject: "Getting your joining documents ready",
    body: DOCUMENTATION_BODY,
  },
  {
    key: "voice_checkin", name: "AI voice check-in", objective: "Hear how things are going",
    anchor: "before_joining", offset: 12, kind: "voice", optional: true,
    subject: "Voice check-in",
    body: "Voice check-in call (only for candidates who agreed to calls).",
  },
  {
    key: "logistics", name: "Joining logistics", objective: "Resolve practical issues",
    anchor: "before_joining", offset: 14, kind: "message",
    subject: "Two weeks to go — logistics",
    body: "Hi {{firstName}}, two weeks to go! Is everything sorted for getting to {{location}} — travel, relocation or anything else? Let me know if anything is still open.",
  },
  {
    key: "docs_reminder", name: "Documentation reminder", objective: "Close outstanding items",
    anchor: "before_joining", offset: 10, kind: "docs",
    subject: "A few items still to complete before {{joiningDate}}",
    body: "Hi {{firstName}}, a quick reminder: these items are still open before your first day. You can upload them securely on your joining page: {{portalLink}}",
  },
  {
    key: "pulse_confirm", name: "Joining confirmation", objective: "Validate plans",
    anchor: "before_joining", offset: 7, kind: "pulse",
    subject: "One week to go — are we still on for {{joiningDate}}?",
    body: "Hi {{firstName}}, we're looking forward to welcoming you on {{joiningDate}}. Is that still your planned joining date?",
  },
  {
    key: "first_day", name: "First-day instructions", objective: "Remove uncertainty",
    anchor: "before_joining", offset: 1, kind: "message",
    subject: "See you tomorrow, {{firstName}}!",
    body: "Hi {{firstName}}, tomorrow is your first day at {{company}}! You'll be joining at {{location}}, and {{hiringManager}} will be expecting you. Your joining page has all the details: {{portalLink}}. Any last-minute questions? I'm here.",
  },
  {
    key: "day1", name: "Welcome and arrival confirmation", objective: "Confirm successful joining",
    anchor: "before_joining", offset: 0, kind: "arrival",
    subject: "Welcome to {{company}}!",
    body: "Good morning {{firstName}} and welcome to {{company}}! 🎉 Reply YES once you've arrived so we know you got in safely — and let me know if you need help finding anything.",
  },
];
