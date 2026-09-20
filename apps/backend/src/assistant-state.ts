import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import type { AssistantStateRepository } from "../../../packages/shared/src/contracts.js";
import { database, mongoClient } from "./store.js";
import { HttpError } from "./config.js";

const fact = z.string().trim().min(3).max(240);
const signed = z.object({ userId: z.string(), id: z.string().uuid(), text: fact,
  evidence: z.string().min(3).max(500), expiresAt: z.string().datetime() }).strict();
type Row = { _id: string; userId: string; id: string; text: string; createdAt: string; removed?: boolean; expiresAt?: Date };
const rows = () => database().collection<Row>("assistant_memories");
// Backend-only HMAC. A model cannot manufacture approval tokens or change a preview.
function signature(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new HttpError(503, "Remembering preferences is unavailable.");
  return createHmac("sha256", secret).update("assistant-memory-v1:" + payload).digest();
}
function readToken(userId: string, token: string) {
  const [payload, mac, extra] = token.split(".");
  try {
    if (extra || !payload || !mac) throw new Error();
    const supplied = Buffer.from(mac, "base64url"), expected = signature(payload);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error();
    const value = signed.parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    if (value.userId !== userId || Date.parse(value.expiresAt) <= Date.now()) throw new Error();
    return value;
  } catch { throw new HttpError(400, "This preference proposal expired or is invalid. Ask Gobbler again."); }
}
/** Invalid limits fail closed; operator limits can lower, never raise these ceilings. */
function cap(name: string, ceiling: number) {
  const n = Number(process.env[name] ?? ceiling);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, ceiling) : 0;
}
export const assistantState: AssistantStateRepository = {
  async list(userId) {
    return (await rows().find({ userId, removed: { $ne: true } }).sort({ createdAt: 1, id: 1 }).limit(12).toArray())
      .map(({ id, text, createdAt }) => ({ id, text, createdAt }));
  },
  propose(userId, text, evidence) {
    const value = signed.parse({ userId, id: randomUUID(), text, evidence,
      expiresAt: new Date(Date.now() + 600000).toISOString() });
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    return { text: value.text, evidence: value.evidence, expiresAt: value.expiresAt,
      token: payload + "." + signature(payload).toString("base64url") };
  },
  async confirm(userId, input) {
    const { token } = z.object({ token: z.string().max(4000), confirmation: z.literal(true) }).strict().parse(input);
    const value = readToken(userId, token);
    if (!mongoClient) throw new HttpError(503, "Remembering preferences is unavailable.");
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        // Serialize the per-user capacity check, including concurrent new proposals.
        await database().collection<{ _id: string; userId: string; version: number }>("assistant_memory_owners")
          .updateOne({ _id: userId }, { $inc: { version: 1 }, $set: { userId } }, { upsert: true, session });
        const existing = await rows().findOne({ _id: value.id, userId }, { session });
        if (existing?.removed) throw new HttpError(409, "This preference was removed. Ask Gobbler for a new proposal.");
        if (existing) return;
        if (await rows().countDocuments({ userId, removed: { $ne: true } }, { session }) >= 12)
          throw new HttpError(409, "You have 12 remembered preferences. Remove one in Settings first.");
        await rows().insertOne({ _id: value.id, userId, id: value.id, text: value.text,
          createdAt: new Date().toISOString() }, { session });
      });
    } finally { await session.endSession(); }
    return this.list(userId);
  },
  async edit(userId, input) {
    const value = z.object({ id: z.string().uuid(), text: fact, expectedText: fact, confirmation: z.literal(true) }).strict().parse(input);
    const result = await rows().updateOne({ userId, id: value.id, text: value.expectedText, removed: { $ne: true } }, { $set: { text: value.text } });
    if (!result.matchedCount && !await rows().findOne({ userId, id: value.id, text: value.text, removed: { $ne: true } }))
      throw new HttpError(409, "This preference changed or was removed. Reload your preferences.");
    return this.list(userId);
  },
  async remove(userId, id) {
    z.string().uuid().parse(id);
    // A short tombstone prevents a previously confirmed token from restoring a deletion.
    await rows().updateOne({ userId, id }, { $set: { removed: true, text: "", expiresAt: new Date(Date.now() + 600000) } });
    return this.list(userId);
  },
  async reserve(userId) {
    if (!mongoClient) return false;
    const now = DateTime.now().setZone("America/Los_Angeles");
    const buckets = [
      [`day:${now.toISODate()}`, cap("GEMINI_DAILY_LIMIT", 100)],
      [`user:${userId}:${now.toISODate()}`, cap("GEMINI_USER_DAILY_LIMIT", 20)],
      [`minute:${Math.floor(Date.now() / 60000)}`, cap("GEMINI_ASSISTANT_RPM", 4)],
    ] as const;
    if (buckets.some(([, limit]) => limit === 0)) return false;
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        for (const [id, limit] of buckets) {
          // _id uniqueness makes upsert at capacity fail atomically under concurrency.
          await database().collection<{ _id: string; count: number; expiresAt: Date }>("assistant_budget")
            .updateOne({ _id: id, count: { $lt: limit } },
              { $inc: { count: 1 }, $set: { expiresAt: new Date(Date.now() + 172800000) } }, { upsert: true, session });
        }
      });
      return true;
    } catch { return false; }
    finally { await session.endSession(); }
  },
};
