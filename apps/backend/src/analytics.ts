import { randomUUID } from "node:crypto";
import { db } from "./store.js";
import { pseudonym } from "./security.js";
import { remote } from "./config.js";
export const analyticsKinds = [
  "recommendation_impression",
  "event_view",
  "save",
  "recommendation_feedback",
] as const;
export async function track(userId: string, kind: string, eventId: string) {
  if (!db) return;
  try {
    if (
      await db
        .collection("analytics_deletions")
        .findOne({ pseudonym: pseudonym(userId) })
    )
      return;
    await db.collection("outbox").insertOne({
      id: randomUUID(),
      pseudonym: pseudonym(userId),
      kind,
      eventId,
      createdAt: new Date(),
      nextAttempt: new Date(),
      attempts: 0,
    });
  } catch {
    console.warn("analytics_enqueue_failed");
  }
}
// Keep a pseudonymous suppression marker so delayed/in-flight interactions can
// never reintroduce deleted users. Remote erasure retries independently of login.
export async function eraseAnalytics(userId: string) {
  if (!db) return;
  const key = pseudonym(userId);
  await db.collection("analytics_deletions").updateOne(
    { pseudonym: key },
    {
      $set: { nextAttempt: new Date(), attempts: 0 },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  await db.collection("outbox").deleteMany({ pseudonym: key });
}
async function remoteErase(key: string) {
  await statement(
    "DELETE FROM workspace.default.gobbler_interactions WHERE pseudonym = :pseudonym",
    [{ name: "pseudonym", value: key }],
  );
}
async function statement(sql: string, parameters: any[] = []) {
  const host = process.env.DATABRICKS_HOST;
  if (
    !host ||
    !/^https:\/\/[a-zA-Z0-9.-]+\.(?:cloud.databricks.com|azuredatabricks.net)$/.test(
      host,
    )
  )
    throw new Error("Configure a valid Databricks workspace origin");
  const result = await (
    await remote(host + "/api/2.0/sql/statements", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.DATABRICKS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        warehouse_id: process.env.DATABRICKS_WAREHOUSE_ID,
        statement: sql,
        parameters,
        wait_timeout: "30s",
        on_wait_timeout: "CANCEL",
      }),
    })
  ).json();
  if (result.status?.state !== "SUCCEEDED")
    throw new Error("Analytics statement did not complete");
  return result;
}
export async function initializeAnalytics() {
  await statement(
    "CREATE TABLE IF NOT EXISTS workspace.default.gobbler_interactions (id STRING, pseudonym STRING, kind STRING, event_id STRING, occurred_at TIMESTAMP) USING DELTA",
  );
}
let draining = false;
export async function flushAnalytics() {
  if (
    draining ||
    !db ||
    !process.env.DATABRICKS_TOKEN ||
    !process.env.DATABRICKS_WAREHOUSE_ID
  )
    return;
  draining = true;
  try {
    for (const row of await db
      .collection("analytics_deletions")
      .find({ nextAttempt: { $lte: new Date() } })
      .limit(30)
      .toArray()) {
      try {
        await remoteErase(row.pseudonym);
        await db.collection("outbox").deleteMany({ pseudonym: row.pseudonym });
        // Retain and periodically reapply suppression across worker crashes/races.
        await db.collection("analytics_deletions").updateOne(
          { _id: row._id },
          {
            $set: {
              completedAt: new Date(),
              nextAttempt: new Date(Date.now() + 86400000),
              attempts: 0,
            },
          },
        );
      } catch {
        await db.collection("analytics_deletions").updateOne(
          { _id: row._id },
          {
            $inc: { attempts: 1 },
            $set: {
              nextAttempt: new Date(
                Date.now() +
                  Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7)),
              ),
            },
          },
        );
      }
    }
    for (const row of await db
      .collection("outbox")
      .find({ nextAttempt: { $lte: new Date() }, attempts: { $lt: 12 } })
      .limit(30)
      .toArray()) {
      try {
        if (
          await db
            .collection("analytics_deletions")
            .findOne({ pseudonym: row.pseudonym })
        ) {
          await db.collection("outbox").deleteOne({ _id: row._id });
          continue;
        }
        await statement(
          "MERGE INTO workspace.default.gobbler_interactions t USING (SELECT :id AS id, :pseudonym AS pseudonym, :kind AS kind, :event AS event_id, CAST(:at AS TIMESTAMP) AS occurred_at) s ON t.id = s.id WHEN NOT MATCHED THEN INSERT *",
          [
            { name: "id", value: row.id },
            { name: "pseudonym", value: row.pseudonym },
            { name: "kind", value: row.kind },
            { name: "event", value: row.eventId },
            { name: "at", value: row.createdAt.toISOString() },
          ],
        );
        // Deletion may have arrived while the remote request was in flight.
        if (
          await db
            .collection("analytics_deletions")
            .findOne({ pseudonym: row.pseudonym })
        )
          await remoteErase(row.pseudonym);
        await db.collection("outbox").deleteOne({ _id: row._id });
      } catch {
        await db.collection("outbox").updateOne(
          { _id: row._id },
          {
            $inc: { attempts: 1 },
            $set: {
              nextAttempt: new Date(
                Date.now() + Math.min(3600000, 30000 * 2 ** row.attempts),
              ),
            },
          },
        );
        break;
      }
    }
  } finally {
    draining = false;
  }
}
