import { claudeEnabled, interpretWithClaude, translateWithClaude } from "./claude";
import { interpretWithRules } from "./rules";
import type { ConversationContext, Interpretation } from "./types";

export type { ConversationContext, Interpretation };

/** Interpret a candidate message. Uses Claude when configured, otherwise (or on failure) deterministic rules. */
export async function interpretMessage(text: string, ctx: ConversationContext): Promise<Interpretation & { engine: "claude" | "rules" }> {
  if (claudeEnabled()) {
    try {
      return { ...(await interpretWithClaude(text, ctx)), engine: "claude" };
    } catch (err) {
      console.error("[ai] Claude interpretation failed, falling back to rules:", (err as Error).message);
    }
  }
  return { ...interpretWithRules(text, ctx), engine: "rules" };
}

/** Journey messages in the candidate's language (needs Claude; otherwise sent in English). */
export async function localize(text: string, language: string) {
  if (!language || language === "en" || !claudeEnabled()) return text;
  try {
    return (await translateWithClaude(text, language)) ?? text;
  } catch (err) {
    console.error("[ai] translation failed, sending English:", (err as Error).message);
    return text;
  }
}
