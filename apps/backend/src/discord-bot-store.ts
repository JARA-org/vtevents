import type {
  DiscordBotRepository,
  DiscordBotCommand,
  DiscordBotReceipt,
} from "../../../packages/shared/src/contracts.js";
import { database, mongoClient } from "./store.js";

/** Only this repository owns bot policy, exclusions, and command receipts. No OAuth/private records are read. */
export const discordBotRepository: DiscordBotRepository = {
  async apply(command: DiscordBotCommand): Promise<DiscordBotReceipt> {
    const db = database();
    if (!mongoClient) throw new Error("Database unavailable");
    const session = mongoClient.startSession();
    try {
      return await session.withTransaction(
        async () => {
          const receipts = db.collection<{ _id: string; content: string }>(
            "discord_bot_receipts",
          );
          const previous = await receipts.findOne(
            { _id: command.interactionId },
            { session },
          );
          if (previous) return { content: previous.content };
          const key = `${command.guildId}:${command.channelId}`;
          // Shared write fence serializes selection/exclusion changes with candidate commits.
          await db
            .collection("discord_collection_fences")
            .updateOne(
              { key },
              { $inc: { revision: 1 } },
              { upsert: true, session },
            );
          const channels = db.collection<{
            _id: string;
            enabled: boolean;
            guildId: string;
            channelId: string;
            actorId: string;
            updatedAt: Date;
          }>("discord_bot_channels");
          let content: string;
          if (command.action === "ignore") {
            if (!command.messageId) throw new Error("Missing message ID");
            await db
              .collection<{
                _id: string;
                guildId: string;
                channelId: string;
                messageId: string;
              }>("discord_bot_exclusions")
              .updateOne(
                { _id: `${key}:${command.messageId}` },
                {
                  $set: {
                    guildId: command.guildId,
                    channelId: command.channelId,
                    messageId: command.messageId,
                  },
                },
                { upsert: true, session },
              );
            await db
              .collection("discord_collected_messages")
              .deleteOne({ key: `${key}:${command.messageId}` }, { session });
            content =
              "This message is excluded from collection and AI processing. Its staged event proposal has been removed.";
          } else if (command.action === "submit") {
            if (!command.messageId) throw new Error("Missing message ID");
            const messageKey = `${key}:${command.messageId}`;
            const excluded = await db
              .collection<{ _id: string }>("discord_bot_exclusions")
              .findOne({ _id: messageKey }, { session });
            if (excluded)
              content = "This message is excluded and cannot be submitted.";
            else {
              await db
                .collection<{
                  _id: string;
                  guildId: string;
                  channelId: string;
                  messageId: string;
                  actorId: string;
                }>("discord_bot_submissions")
                .updateOne(
                  { _id: messageKey },
                  {
                    $set: {
                      guildId: command.guildId,
                      channelId: command.channelId,
                      messageId: command.messageId,
                      actorId: command.actorId,
                    },
                  },
                  { upsert: true, session },
                );
              content =
                "This message is designated as public input for the configured collector. No other messages in this channel are selected.";
            }
          } else {
            await channels.updateOne(
              { _id: key },
              {
                $set: {
                  guildId: command.guildId,
                  channelId: command.channelId,
                  enabled: command.action === "watch",
                  ...(command.action === "watch" ? { scan: {} } : {}),
                  actorId: command.actorId,
                  updatedAt: new Date(),
                },
              },
              { upsert: true, session },
            );
            if (command.action === "unwatch") {
              const submissions = await db
                .collection("discord_bot_submissions")
                .find(
                  { guildId: command.guildId, channelId: command.channelId },
                  { session },
                )
                .toArray();
              await db.collection("discord_collected_messages").deleteMany(
                {
                  guildId: command.guildId,
                  channelId: command.channelId,
                  messageId: { $nin: submissions.map((s) => s.messageId) },
                },
                { session },
              );
            }
            content =
              command.action === "watch"
                ? "Gobbler may read this channel's messages as public input, except opt-outs. No Discord settings were changed. Use [no-ai] or Ignore for Gobbler to exclude messages. Processing follows the backend collection settings."
                : "Automatic reading is off. Individually submitted messages remain separate. No Discord settings were changed.";
          }
          await receipts.insertOne(
            { _id: command.interactionId, content },
            { session },
          );
          return { content };
        },
        { timeoutMS: 1800, maxCommitTimeMS: 1000 },
      );
    } finally {
      await session.endSession();
    }
  },
  async eligible(input) {
    const key = `${input.guildId}:${input.channelId}`;
    const db = database();
    const channel = await db
      .collection<{ _id: string; enabled: boolean }>("discord_bot_channels")
      .findOne({ _id: key });
    const submitted = await db
      .collection<{ _id: string }>("discord_bot_submissions")
      .findOne({ _id: `${key}:${input.messageId}` });
    if (!channel?.enabled && !submitted) return false;
    return !(await db
      .collection<{ _id: string }>("discord_bot_exclusions")
      .findOne({ _id: `${key}:${input.messageId}` }));
  },
};
