import { createHash, randomUUID } from "node:crypto";
import type { SemanticIndexRepository } from "../../../packages/shared/src/contracts.js";
import { database, mongoClient } from "./store.js";
const owner = randomUUID();
const userKey = (id: string) => createHash("sha256").update(`semantic-budget:${id}`).digest("hex");
/** Private persistence adapter: vectors contain only public website evidence. Queries
 * are never stored. Reservations are transactional, successful writes idempotent;
 * failures throw/fail closed. Lease acquisition never grants authorization. */
export const semanticRepository: SemanticIndexRepository = {
  async read(keys) {
    const rows = await database().collection("semantic_vectors").find({ _id: { $in: keys } as never }).toArray();
    return rows.map(r => ({ key: String(r._id), vector: r.vector }));
  },
  async put(rows) {
    if (!rows.length) return;
    await database().collection("semantic_vectors").bulkWrite(rows.map(r => ({ updateOne: {
      filter: { _id: r.key as never }, update: { $set: { vector: r.vector, updatedAt: new Date() } }, upsert: true,
    } })));
  },
  async prune(keys) {
    await database().collection("semantic_vectors").deleteMany({ _id: { $nin: keys } as never });
  },
  async reserve(count, userId) {
    if (!mongoClient || !Number.isInteger(count) || count < 1 || count > 16) return false;
    const now = new Date(), day = now.toISOString().slice(0, 10), minute = Math.floor(now.getTime() / 60000);
    const scopes: [string, number, number][] = [
      [`day:${day}`, 2500, count], [`minute:${minute}`, 160, count],
      ...(userId ? [[`user:${userKey(userId)}:${day}`, 50, 1] as [string, number, number]] : []),
    ];
    const session = mongoClient.startSession();
    try { return await session.withTransaction(async () => {
      const rows = database().collection<{ _id: string; count: number; expiresAt: Date }>("semantic_budget");
      for (const [id, limit, add] of scopes)
        if (((await rows.findOne({ _id: id }, { session }))?.count || 0) + add > limit) return false;
      for (const [id, , add] of scopes) await rows.updateOne({ _id: id }, {
        $inc: { count: add }, $set: { expiresAt: new Date(now.getTime() + 2 * 86400000) },
      }, { session, upsert: true });
      return true;
    }); } catch { return false; } finally { await session.endSession(); }
  },
  async acquire() {
    try {
      const result = await database().collection("semantic_leases").findOneAndUpdate(
        { _id: "index" as never, until: { $lt: new Date() } },
        { $set: { owner, until: new Date(Date.now() + 180000) } }, { upsert: true, returnDocument: "after" });
      return result?.owner === owner;
    } catch { return false; }
  },
  async release() { await database().collection("semantic_leases").deleteOne({ _id: "index" as never, owner }); },
  async forgetUser(userId) {
    await database().collection("semantic_budget").deleteMany({ _id: { $regex: `^user:${userKey(userId)}:` } as never });
  },
};
