import { db } from "./db";

export async function logEvent(candidateId: string, type: string, detail: string, actor = "system") {
  return db.event.create({ data: { candidateId, type, detail, actor } });
}
