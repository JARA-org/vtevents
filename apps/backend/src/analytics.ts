import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import { pseudonym } from "./security.js";
export const analyticsKinds = [
  "recommendation_impression",
  "event_view",
  "save",
  "calendar_addition",
  "recommendation_feedback",
] as const;
/** Session-derived identity and validated interaction input. Writes a local pseudonymous
 * record with 30-day TTL; no provider/model effects or retries. Each call is a distinct
 * observation. Failures are logged without payloads and do not break discovery. */
export async function track(userId: string, kind: string, eventId: string) {
  if (!db) return;
  try {
    if (
      await db
        .collection("analytics_deletions")
        .findOne({ pseudonym: pseudonym(userId) })
    )
      return;
    const key = pseudonym(userId);
    const id = randomUUID();
    await db.collection("outbox").insertOne({
      id,
      pseudonym: key,
      kind,
      eventId,
      createdAt: new Date(),
    });
    // A deletion racing this write must also remove the late local record.
    if (await db.collection("analytics_deletions").findOne({ pseudonym: key }))
      await db.collection("outbox").deleteOne({ id });
  } catch {
    console.warn("analytics_record_failed");
  }
}
// Keep a pseudonymous suppression marker to reject later interactions.
// Analytics are local-only; no provider credentials, queues or network calls.
/** Account-deletion operation. Installs a suppression marker then deletes local
 * interactions; repeatable, no remote effects. Database failures propagate so erasure
 * is not falsely reported as complete. Individual writes are atomic. */
export async function eraseAnalytics(userId: string) {
  if (!db) return;
  const key = pseudonym(userId);
  await db.collection("analytics_deletions").updateOne(
    { pseudonym: key },
    {
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  await db.collection("outbox").deleteMany({ pseudonym: key });
}
