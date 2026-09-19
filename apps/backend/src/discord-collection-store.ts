import { randomUUID } from "node:crypto";
import { database, mongoClient } from "./store.js";
import { discordExtractionLimits } from "./discord-limits.js";
import { discordBotRepository } from "./discord-bot-store.js";
import { discordClubSetup } from "./club-accounts.js";
import { discordAnnouncements } from "./discord-announcements.js";
import type {
  DiscordCollectionRepository,
  DiscordReadTarget,
  DiscordInspectionService,
  DiscordCollectionInspection,
} from "../../../packages/shared/src/contracts.js";
const owner = randomUUID();
const key = (t: DiscordReadTarget) =>
  `${t.guildId}:${t.channelId}:${t.messageId}`;
const channelKey = (t: DiscordReadTarget) => `${t.guildId}:${t.channelId}`;
const records = () => database().collection("discord_collected_messages");
export const discordCollectionRepository: DiscordCollectionRepository = {
  async channels(limit) {
    const selected: Awaited<
      ReturnType<DiscordCollectionRepository["channels"]>
    > = [];
    const cursor = database()
      .collection("discord_bot_channels")
      .find({ enabled: true })
      .sort({ collectionCheckedAt: 1, _id: 1 });
    try {
      for await (const row of cursor) {
        if (!(await discordClubSetup.linked(row.guildId))) continue;
        selected.push({
          guildId: row.guildId,
          channelId: row.channelId,
          scan: row.scan || {},
        });
        if (selected.length >= limit) break;
      }
    } finally {
      await cursor.close();
    }
    return selected;
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
    if (!(await discordClubSetup.linked(message.guildId))) return;
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
        if (!(await discordAnnouncements.current(message))) return;
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
          ((!watched ||
            (watched.watchFrom &&
              BigInt(message.messageId) <= BigInt(watched.watchFrom))) &&
            !submitted) ||
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
              imageTexts: message.imageTexts || [],
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
  async acquire(target) {
    const locks = database().collection("discord_collection_locks");
    try {
      const row = await locks.findOneAndUpdate(
        {
          key: target ? `message:${key(target)}` : "collector",
          until: { $lt: new Date() },
        },
        { $set: { owner, until: new Date(Date.now() + 300000) } },
        { upsert: true, returnDocument: "after" },
      );
      return row?.owner === owner;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false;
      throw e;
    }
  },
  async release(target) {
    await database()
      .collection("discord_collection_locks")
      .deleteOne({
        key: target ? `message:${key(target)}` : "collector",
        owner,
      });
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
  async reserveExtraction(input) {
    if (!mongoClient) throw new Error("Storage unavailable");
    const limits = input.limits.serverOnly
      ? [input.limits.guildDaily, input.limits.guildHourly]
      : [
          input.limits.globalDaily,
          input.limits.guildDaily,
          input.limits.guildHourly,
          input.limits.messageDaily,
        ];
    if (limits.some((n) => !Number.isInteger(n) || n <= 0)) return false;
    const now = new Date().toISOString(),
      day = now.slice(0, 10),
      hour = now.slice(0, 13);
    const counters = database().collection<{ _id: string; count: number }>(
      "discord_extraction_counters",
    );
    const global = database().collection("discord_extraction_budget");
    const scopes = [
      {
        id: `guild:${input.guildId}:day:${day}`,
        limit: input.limits.guildDaily,
      },
      {
        id: `guild:${input.guildId}:hour:${hour}`,
        limit: input.limits.guildHourly,
      },
      ...(!input.limits.serverOnly
        ? [
            {
              id: `message:${key(input)}:day:${day}`,
              limit: input.limits.messageDaily,
            },
          ]
        : []),
      {
        id: input.limits.serverOnly
          ? `revision:${key(input)}:${input.fingerprint}`
          : `revision:${key(input)}:${input.fingerprint}:day:${day}`,
        limit: 1,
      },
    ];
    const session = mongoClient.startSession();
    try {
      return await session.withTransaction(async () => {
        if (
          !input.limits.serverOnly &&
          ((await global.findOne({ day }, { session }))?.count || 0) >=
            input.limits.globalDaily
        )
          return false;
        for (const scope of scopes)
          if (
            ((await counters.findOne({ _id: scope.id }, { session }))?.count ||
              0) >= scope.limit
          )
            return false;
        if (!input.limits.serverOnly)
          await global.updateOne(
            { day },
            { $inc: { count: 1 } },
            { upsert: true, session },
          );
        for (const scope of scopes)
          await counters.updateOne(
            { _id: scope.id },
            { $inc: { count: 1 } },
            { upsert: true, session },
          );
        return true;
      });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false;
      throw e;
    } finally {
      await session.endSession();
    }
  },
};

/** Read-only, channel-scoped DTO. Called only after signed Discord permission checks. */
export const discordInspection: DiscordInspectionService = {
  async inspect(input) {
    const listener = await database()
      .collection("discord_listener_state")
      .findOne({ key: "gateway" });
    const now = new Date().toISOString(),
      day = now.slice(0, 10),
      hour = now.slice(0, 13);
    const db = database();
    const counters = db.collection<{ _id: string; count: number }>(
      "discord_extraction_counters",
    );
    const [channel, global, guildDay, guildHour, recent] = await Promise.all([
      db
        .collection<{ _id: string; enabled: boolean }>("discord_bot_channels")
        .findOne({ _id: channelKey(input) }),
      db.collection("discord_extraction_budget").findOne({ day }),
      counters.findOne({ _id: `guild:${input.guildId}:day:${day}` }),
      counters.findOne({ _id: `guild:${input.guildId}:hour:${hour}` }),
      records()
        .find({ guildId: input.guildId, channelId: input.channelId })
        .sort({ collectionCheckedAt: -1 })
        .limit(15)
        .toArray(),
    ]);
    const messages: DiscordCollectionInspection["messages"] = [];
    for (const row of recent) {
      if (
        !(await discordBotRepository.eligible({
          ...input,
          messageId: row.messageId,
        }))
      )
        continue;
      if (!["pending", "qualified", "rejected"].includes(row.status)) continue;
      messages.push({
        messageId: row.messageId,
        sourceUrl: `https://discord.com/channels/${input.guildId}/${input.channelId}/${row.messageId}`,
        preview: String(row.text).slice(0, 160),
        status: row.status,
        eventTitle: row.candidate?.title,
        eventDate: row.candidate?.date,
      });
      if (messages.length === 5) break;
    }
    return {
      ...input,
      watching: !!channel?.enabled,
      listenerStatus:
        process.env.DISCORD_COLLECTION_ENABLED !== "true"
          ? "disabled"
          : listener &&
              listener.checkedAt instanceof Date &&
              Date.now() - listener.checkedAt.getTime() < 90000
            ? listener.status
            : "disconnected",
      collectionEnabled: process.env.DISCORD_COLLECTION_ENABLED === "true",
      aiEnabled:
        process.env.DISCORD_AI_ENABLED === "true" &&
        !!process.env.GEMINI_API_KEY,
      limits: discordExtractionLimits(),
      usage: {
        globalDaily: global?.count || 0,
        guildDaily: guildDay?.count || 0,
        guildHourly: guildHour?.count || 0,
      },
      messages,
    };
  },
};
