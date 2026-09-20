import { MongoClient, Db } from "mongodb";
import { config, HttpError } from "./config.js";
export let db: Db | undefined;
export let mongoClient: MongoClient | undefined;
export function database() {
  if (!db)
    throw new HttpError(
      503,
      "Account services are not configured yet. Please try again later.",
    );
  return db;
}
export async function connectDB() {
  if (!config.mongo) return;
  mongoClient = new MongoClient(config.mongo, {
    serverSelectionTimeoutMS: 10000,
    // Absent optional fields must stay absent. Without this the driver stores
    // `undefined` as BSON null, and reading it back fails the optional
    // non-nullable field schemas. Explicit nulls are unaffected, so a
    // deliberately cleared nullable value still round-trips.
    ignoreUndefined: true,
  });
  await mongoClient.connect();
  db = mongoClient.db(config.db);
  // One-time migration: existing watches start at their original activation time,
  // never at the beginning of channel history. Missing timestamps start now.
  const legacyWatches = db
    .collection("discord_bot_channels")
    .find({ watchFrom: { $exists: false } });
  for await (const channel of legacyWatches) {
    const timestamp =
      channel.updatedAt instanceof Date
        ? channel.updatedAt.getTime()
        : Date.now();
    const watchFrom = (
      (BigInt(Math.max(1420070400000, timestamp)) - 1420070400000n) <<
      22n
    ).toString();
    await db
      .collection("discord_bot_channels")
      .updateOne(
        { _id: channel._id, watchFrom: { $exists: false } },
        { $set: { watchFrom, scan: { cursor: watchFrom } } },
      );
  }
  await Promise.all([
    db
      .collection("account_email_outbox")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("account_email_outbox").createIndex({ nextAttempt: 1 }),
    db
      .collection("discord_message_jobs")
      .createIndex({ dueAt: 1, leaseUntil: 1 }),
    db
      .collection("discord_listener_state")
      .createIndex({ key: 1 }, { unique: true }),
    db
      .collection("managed_clubs")
      .createIndex({ ownerId: 1, requestId: 1 }, { unique: true }),
    db.collection("managed_clubs").createIndex(
      { discordGuildId: 1 },
      {
        unique: true,
        partialFilterExpression: { discordGuildId: { $type: "string" } },
      },
    ),
    db
      .collection("club_discord_tickets")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("discord_collection_refs")
      .createIndex({ key: 1 }, { unique: true }),
    db
      .collection("discord_collected_messages")
      .createIndex({ key: 1 }, { unique: true }),
    db
      .collection("discord_collection_fences")
      .createIndex({ key: 1 }, { unique: true }),
    db
      .collection("discord_collection_locks")
      .createIndex({ key: 1 }, { unique: true }),
    db
      .collection("discord_extraction_budget")
      .createIndex({ day: 1 }, { unique: true }),
    db
      .collection("discord_guilds")
      .createIndex({ guildId: 1 }, { unique: true }),
    db.collection("profiles").createIndex({ userId: 1 }, { unique: true }),
    db.collection("events").createIndex({ id: 1 }, { unique: true }),
    db
      .collection("source_snapshots")
      .createIndex({ source: 1 }, { unique: true }),
    db.collection("ai_budget").createIndex({ day: 1 }, { unique: true }),
    db.collection("voice_budget").createIndex({ month: 1 }, { unique: true }),
    db.collection("voice_cache").createIndex({ key: 1 }, { unique: true }),
    db
      .collection("voice_cache")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("voice_locks").createIndex({ key: 1 }, { unique: true }),
    db
      .collection("voice_locks")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("analytics_deletions")
      .createIndex({ pseudonym: 1 }, { unique: true }),
    db
      .collection("saved")
      .createIndex({ userId: 1, eventId: 1 }, { unique: true }),
    db
      .collection("connections")
      .createIndex({ userId: 1, provider: 1 }, { unique: true }),
    db
      .collection("oauth_states")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("calendar_writes")
      .createIndex({ userId: 1, eventId: 1, destination: 1 }, { unique: true }),
    db.collection("outbox").createIndex({ nextAttempt: 1 }),
    db
      .collection("private_context")
      .createIndex({ userId: 1, provider: 1 }, { unique: true }),
    db
      .collection("feedback")
      .createIndex({ userId: 1, eventId: 1 }, { unique: true }),
    db
      .collection("outbox")
      .createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 }),
  ]);
}
