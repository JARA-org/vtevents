import { randomUUID } from "node:crypto";
import type {
  DiscordAnnouncementRepository,
  DiscordReadTarget,
} from "../../../packages/shared/src/contracts.js";
import { database, mongoClient } from "./store.js";
import { discordClubSetup } from "./club-accounts.js";
const key = (t: DiscordReadTarget) =>
  `${t.guildId}:${t.channelId}:${t.messageId}`;
const links = () =>
  database().collection<{ _id: string; rootId: string }>(
    "discord_announcement_links",
  );
const groups = () =>
  database().collection<{
    _id: string;
    revision: string;
    messageIds: string[];
  }>("discord_announcement_groups");

export const discordAnnouncements: DiscordAnnouncementRepository = {
  async append(input) {
    if (!(await discordClubSetup.linked(input.guildId)))
      return { content: "Link your club first with /gobbler setup." };
    if (
      ![
        input.guildId,
        input.channelId,
        input.messageId,
        input.announcementId,
        input.interactionId,
      ].every((v) => /^\d{1,20}$/.test(v))
    )
      return { content: "Invalid message IDs." };
    if (!mongoClient) throw new Error("Storage unavailable");
    const session = mongoClient.startSession();
    try {
      return await session.withTransaction(
        async () => {
          const db = database(),
            scope = `${input.guildId}:${input.channelId}`;
          const receipts = db.collection<{ _id: string; content: string }>(
            "discord_bot_receipts",
          );
          const previous = await receipts.findOne(
            { _id: input.interactionId },
            { session },
          );
          if (previous) return { content: previous.content };
          await db
            .collection("discord_collection_fences")
            .updateOne(
              { key: scope },
              { $inc: { revision: 1 } },
              { upsert: true, session },
            );
          const linked = await links().findOne(
            { _id: `${scope}:${input.announcementId}` },
            { session },
          );
          const rootId = linked?.rootId || input.announcementId;
          const rootKey = `${scope}:${rootId}`;
          const group = await groups().findOne({ _id: rootKey }, { session });
          const member = await links().findOne(
            { _id: key(input) },
            { session },
          );
          const otherGroup = await groups().findOne(
            { _id: key(input) },
            { session },
          );
          let content: string;
          const ids = [
            ...new Set([...(group?.messageIds || [rootId]), input.messageId]),
          ];
          if (
            rootId === input.messageId ||
            (member && member.rootId !== rootId) ||
            (otherGroup && input.messageId !== rootId)
          )
            content =
              "That message is already an announcement or belongs to another announcement. Cycles and merging separate groups are not allowed.";
          else if (ids.length > 8)
            content = "An announcement can include up to eight messages.";
          else if (
            await db
              .collection("discord_bot_exclusions")
              .findOne(
                { _id: { $in: ids.map((id) => `${scope}:${id}`) } as never },
                { session },
              )
          )
            content = "An excluded message cannot be appended.";
          else {
            await groups().updateOne(
              { _id: rootKey },
              { $set: { messageIds: ids, revision: randomUUID() } },
              { upsert: true, session },
            );
            for (const id of ids) {
              await links().updateOne(
                { _id: `${scope}:${id}` },
                { $set: { rootId } },
                { upsert: true, session },
              );
              await db
                .collection("discord_bot_submissions")
                .updateOne(
                  { _id: `${scope}:${id}` as never },
                  {
                    $set: {
                      guildId: input.guildId,
                      channelId: input.channelId,
                      messageId: id,
                      actorId: input.actorId,
                    },
                  },
                  { upsert: true, session },
                );
            }
            await db
              .collection("discord_collected_messages")
              .deleteMany(
                { key: { $in: ids.map((id) => `${scope}:${id}`) } },
                { session },
              );
            await db
              .collection("discord_message_jobs")
              .updateOne(
                { _id: rootKey as never },
                {
                  $set: {
                    guildId: input.guildId,
                    channelId: input.channelId,
                    messageId: rootId,
                    revision: randomUUID(),
                    dueAt: new Date(Date.now() + 3000),
                  },
                },
                { upsert: true, session },
              );
            content =
              "Messages linked as public input and queued as one announcement. Text and attached flyers will be read together, subject to opt-outs and server AI limits. No Discord messages were changed.";
          }
          await receipts.insertOne(
            { _id: input.interactionId, content },
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
  async root(target) {
    const link = await links().findOne({ _id: key(target) });
    return { ...target, messageId: link?.rootId || target.messageId };
  },
  async members(target) {
    const group = await groups().findOne({ _id: key(target) });
    return {
      revision: group?.revision,
      messageIds: group?.messageIds || [target.messageId!],
    };
  },
  async invalidate(target) {
    const root = await this.root(target);
    const result = await groups().updateOne(
      { _id: key(root) },
      { $set: { revision: randomUUID() } },
    );
    if (result.matchedCount)
      await database()
        .collection("discord_collected_messages")
        .deleteOne({ key: key(root) });
    return root;
  },
  async current(message) {
    const root = await this.root(message);
    if (root.messageId !== message.messageId) return false;
    const group = await this.members(root);
    if (group.revision !== message.groupRevision) return false;
    const ids = message.parts?.map((p) => p.messageId) || [message.messageId];
    if (
      ids.length !== group.messageIds.length ||
      ids.some((id) => !group.messageIds.includes(id))
    )
      return false;
    return !(await database()
      .collection("discord_bot_exclusions")
      .findOne({
        _id: {
          $in: ids.map((id) => key({ ...message, messageId: id })),
        } as never,
      }));
  },
};
