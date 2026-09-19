import { MongoClient, Db } from "mongodb";
import { config, HttpError } from "./config.js";
export let db: Db | undefined;
export let mongoClient: MongoClient | undefined;
export function database() {
  if (!db)
    throw new HttpError(
      503,
      "Account services are not configured yet. You can still explore the demo.",
    );
  return db;
}
export async function connectDB() {
  if (!config.mongo) return;
  mongoClient = new MongoClient(config.mongo, {
    serverSelectionTimeoutMS: 10000,
  });
  await mongoClient.connect();
  db = mongoClient.db(config.db);
  await Promise.all([
    db.collection("profiles").createIndex({ userId: 1 }, { unique: true }),
    db.collection("events").createIndex({ id: 1 }, { unique: true }),
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
