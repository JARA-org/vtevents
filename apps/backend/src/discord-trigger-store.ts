import { randomUUID } from "node:crypto";
import type { DiscordTriggerQueue } from "../../../packages/shared/src/contracts.js";
import { database, mongoClient } from "./store.js";
import { discordBotRepository } from "./discord-bot-store.js";
const jobs = () =>
  database().collection<{
    _id: string;
    guildId: string;
    channelId: string;
    messageId: string;
    revision: string;
    dueAt: Date;
    leaseUntil?: Date;
    leaseOwner?: string;
    attempts?: number;
  }>("discord_message_jobs");
const key = (t: { guildId: string; channelId: string; messageId?: string }) =>
  `${t.guildId}:${t.channelId}:${t.messageId}`;
export const discordTriggerQueue: DiscordTriggerQueue = {
  async enqueue(target, delayMs) {
    if (
      !target.messageId ||
      !(await discordBotRepository.eligible({
        ...target,
        messageId: target.messageId,
      }))
    )
      return;
    await jobs().updateOne(
      { _id: key(target) },
      {
        $set: {
          guildId: target.guildId,
          channelId: target.channelId,
          messageId: target.messageId,
          revision: randomUUID(),
          dueAt: new Date(Date.now() + delayMs),
          // A new trigger is fresh work: its backoff restarts from the first step.
          attempts: 0,
        },
      },
      { upsert: true },
    );
  },
  async withdraw(target) {
    if (!mongoClient) throw new Error("Storage unavailable");
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        await database()
          .collection("discord_collection_fences")
          .updateOne(
            { key: `${target.guildId}:${target.channelId}` },
            { $inc: { revision: 1 } },
            { upsert: true, session },
          );
        await database()
          .collection("discord_bot_exclusions")
          .updateOne(
            { _id: key(target) as never },
            {
              $set: {
                guildId: target.guildId,
                channelId: target.channelId,
                messageId: target.messageId,
              },
            },
            { upsert: true, session },
          );
        await database()
          .collection("discord_collected_messages")
          .deleteOne({ key: key(target) }, { session });
        await jobs().deleteOne({ _id: key(target) }, { session });
      });
    } finally {
      await session.endSession();
    }
  },
  async claim() {
    const leaseOwner = randomUUID();
    const row = await jobs().findOneAndUpdate(
      {
        dueAt: { $lte: new Date() },
        $or: [
          { leaseUntil: { $exists: false } },
          { leaseUntil: { $lt: new Date() } },
        ],
      },
      {
        $set: { leaseOwner, leaseUntil: new Date(Date.now() + 180000) },
        $inc: { attempts: 1 },
      },
      { sort: { dueAt: 1 }, returnDocument: "after" },
    );
    return row
      ? {
          guildId: row.guildId,
          channelId: row.channelId,
          messageId: row.messageId,
          revision: row.revision,
          leaseOwner,
          attempts: row.attempts || 1,
        }
      : null;
  },
  async finish(job, retryMs) {
    const filter = {
      _id: key(job),
      revision: job.revision,
      leaseOwner: job.leaseOwner,
    };
    if (retryMs !== undefined)
      await jobs().updateOne(filter, {
        $set: { dueAt: new Date(Date.now() + retryMs) },
        $unset: { leaseUntil: "", leaseOwner: "" },
      });
    else await jobs().deleteOne(filter);
    // A newer revision may have arrived during inference; release its lease, preserving its due time.
    await jobs().updateOne(
      { _id: key(job), leaseOwner: job.leaseOwner },
      { $unset: { leaseUntil: "", leaseOwner: "" } },
    );
  },
};
