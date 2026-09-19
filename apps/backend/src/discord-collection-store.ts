import { randomUUID } from "node:crypto";
import { database, mongoClient } from "./store.js";
import type {
  DiscordCollectionRepository,
  DiscordReadTarget,
} from "../../../packages/shared/src/contracts.js";
const owner = randomUUID();
const key = (t: DiscordReadTarget) =>
  `${t.guildId}:${t.channelId}:${t.messageId}`;
const channelKey = (t: DiscordReadTarget) => `${t.guildId}:${t.channelId}`;
const records = () => database().collection("discord_collected_messages");
export const discordCollectionRepository: DiscordCollectionRepository = {
  async channels(limit) {
    return (
      await database()
        .collection("discord_bot_channels")
        .find({ enabled: true })
        .sort({ collectionCheckedAt: 1, _id: 1 })
        .limit(limit)
        .toArray()
    ).map((r) => ({
      guildId: r.guildId,
      channelId: r.channelId,
      scan: r.scan || {},
    }));
  },
  async messages(limit) {
    // Separate bounded reads ensure neither watched records nor manual submissions starve.
    const [manual, known] = await Promise.all([
      database()
        .collection("discord_bot_submissions")
        .find({})
        .sort({ collectionCheckedAt: 1, _id: 1 })
        .limit(limit)
        .toArray(),
      database()
        .collection("discord_collection_refs")
        .find({})
        .sort({ collectionCheckedAt: 1, _id: 1 })
        .limit(limit)
        .toArray(),
    ]);
    return [
      ...new Map(
        [...manual, ...known].map((r) => [
          key(r as unknown as DiscordReadTarget),
          {
            guildId: r.guildId,
            channelId: r.channelId,
            messageId: r.messageId,
          },
        ]),
      ).values(),
    ];
  },
  async unchanged(target, fingerprint) {
    return !!(await records().findOne({
      key: key(target),
      fingerprint,
      status: { $in: ["qualified", "rejected"] },
    }));
  },
  async save(message, fingerprint, candidate, status) {
    if (!mongoClient) throw new Error("Storage unavailable");
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        const db = database();
        const id = channelKey(message);
        await db
          .collection("discord_collection_fences")
          .updateOne(
            { key: id },
            { $inc: { revision: 1 } },
            { upsert: true, session },
          );
        const watched = await db
          .collection("discord_bot_channels")
          .findOne({ _id: id as never, enabled: true }, { session });
        const submitted = await db
          .collection("discord_bot_submissions")
          .findOne({ _id: key(message) as never }, { session });
        const excluded = await db
          .collection("discord_bot_exclusions")
          .findOne({ _id: key(message) as never }, { session });
        if (
          (!watched && !submitted) ||
          excluded ||
          /\[no-ai\]/i.test(message.text)
        ) {
          await records().deleteOne({ key: key(message) }, { session });
          return;
        }
        await db.collection("discord_collection_refs").updateOne(
          { key: key(message) },
          {
            $set: {
              guildId: message.guildId,
              channelId: message.channelId,
              messageId: message.messageId,
              collectionCheckedAt: new Date(),
            },
          },
          { upsert: true, session },
        );
        await records().updateOne(
          { key: key(message) },
          {
            $set: {
              ...message,
              fingerprint,
              candidate,
              status,
              collectionCheckedAt: new Date(),
            },
          },
          { upsert: true, session },
        );
      });
    } finally {
      await session.endSession();
    }
  },
  async remove(target) {
    await records().deleteOne({ key: key(target) });
    // ID-only tombstone permits detecting a later edit that removes [no-ai]; no excluded text is retained.
    await database()
      .collection("discord_collection_refs")
      .updateOne(
        { key: key(target) },
        {
          $set: {
            guildId: target.guildId,
            channelId: target.channelId,
            messageId: target.messageId,
            collectionCheckedAt: new Date(),
          },
        },
        { upsert: true },
      );
  },
  async checkpoint(target, scan) {
    await database()
      .collection("discord_bot_channels")
      .updateOne(
        { _id: channelKey(target) as never },
        { $set: { scan, collectionCheckedAt: new Date() } },
      );
  },
  async checked(target) {
    await database()
      .collection("discord_collection_refs")
      .updateOne(
        { key: key(target) },
        { $set: { collectionCheckedAt: new Date() } },
      );
    await records().updateOne(
      { key: key(target) },
      { $set: { collectionCheckedAt: new Date() } },
    );
    await database()
      .collection("discord_bot_submissions")
      .updateOne(
        { _id: key(target) as never },
        { $set: { collectionCheckedAt: new Date() } },
      );
  },
  async acquire() {
    const locks = database().collection("discord_collection_locks");
    try {
      const row = await locks.findOneAndUpdate(
        { key: "collector", until: { $lt: new Date() } },
        { $set: { owner, until: new Date(Date.now() + 300000) } },
        { upsert: true, returnDocument: "after" },
      );
      return row?.owner === owner;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false;
      throw e;
    }
  },
  async release() {
    await database()
      .collection("discord_collection_locks")
      .deleteOne({ key: "collector", owner });
  },
  async reserveAI(limit) {
    const day = new Date().toISOString().slice(0, 10);
    const result = await database()
      .collection("discord_extraction_budget")
      .findOneAndUpdate(
        { day },
        { $inc: { count: 1 } },
        { upsert: true, returnDocument: "after" },
      );
    return (result?.count || 0) <= limit;
  },
};
