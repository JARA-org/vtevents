import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createAnnouncementReader } from "../apps/backend/src/discord-announcement-reader.js";
import { handleDiscordInteraction } from "../apps/backend/src/discord-bot.js";
import {
  downloadDiscordImages,
  validDiscordImage,
} from "../apps/backend/src/discord-images.js";
import { validateDiscordCandidate } from "../apps/backend/src/discord-event-rules.js";
import type { DiscordImageAttachment } from "../packages/shared/src/contracts.js";

test("append command requires administrator/read permissions and same-channel links", async () => {
  let writes = 0;
  const repo = {
    apply: async () => ({ content: "unused" }),
    eligible: async () => true,
    append: async () => {
      writes++;
      return { content: "Linked" };
    },
  };
  const command = {
    id: "1",
    application_id: "2",
    type: 2,
    guild_id: "3",
    channel_id: "4",
    member: { user: { id: "5" }, permissions: "66592" },
    app_permissions: "66560",
    data: {
      name: "gobbler",
      type: 1,
      options: [
        {
          name: "append",
          type: 1,
          options: [
            {
              name: "announcement",
              type: 3,
              value: "https://discord.com/channels/3/4/10",
            },
            {
              name: "message",
              type: 3,
              value: "https://discord.com/channels/3/4/11",
            },
          ],
        },
      ],
    },
  };
  const setup = { linked: async () => true, setup: async () => ({ url: "" }) };
  await handleDiscordInteraction(command, "2", repo, undefined, setup);
  assert.equal(writes, 1);
  await handleDiscordInteraction(
    { ...command, member: { user: { id: "5" }, permissions: "66560" } },
    "2",
    repo,
    undefined,
    setup,
  );
  await handleDiscordInteraction(
    { ...command, app_permissions: "0" },
    "2",
    repo,
    undefined,
    setup,
  );
  await handleDiscordInteraction(
    { ...command, channel_id: "9" },
    "2",
    repo,
    undefined,
    setup,
  );
  assert.equal(writes, 1);
});

test("explicit groups persist, chain to one root, reject cycles, and invalidate stale or opted-out publication", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const { discordAnnouncements: groups } =
    await import("../apps/backend/src/discord-announcements.js");
  const { discordBotRepository: policy } =
    await import("../apps/backend/src/discord-bot-store.js");
  const { discordCollectionRepository: collection } =
    await import("../apps/backend/src/discord-collection-store.js");
  try {
    await store.database().collection("user").insertOne({ id: "owner" });
    await store
      .database()
      .collection("managed_clubs")
      .insertOne({ ownerId: "owner", discordGuildId: "3", name: "Club" });
    const input = {
      guildId: "3",
      channelId: "4",
      actorId: "5",
      interactionId: "100",
      announcementId: "10",
      messageId: "11",
    };
    const receipt = await groups.append(input);
    assert.match(receipt.content, /linked/);
    assert.deepEqual(await groups.append(input), receipt);
    await groups.append({
      ...input,
      interactionId: "101",
      announcementId: "11",
      messageId: "12",
    });
    assert.equal(
      (await groups.root({ ...input, messageId: "12" })).messageId,
      "10",
    );
    assert.deepEqual(
      (await groups.members({ ...input, messageId: "10" })).messageIds,
      ["10", "11", "12"],
    );
    assert.match(
      (
        await groups.append({
          ...input,
          interactionId: "102",
          announcementId: "12",
          messageId: "10",
        })
      ).content,
      /Cycles/,
    );
    let excluded = false;
    const reader = createAnnouncementReader(
      {
        list: async () => [],
        get: async (target) => ({
          guildId: "3",
          channelId: "4",
          messageId: target.messageId!,
          text: excluded && target.messageId === "11" ? "[no-ai]" : "Chess",
          createdAt: "2026-09-19T12:00:00Z",
          editedAt: null,
          sourceUrl: "https://discord.com/channels/3/4/" + target.messageId,
        }),
      },
      groups,
      policy,
    );
    const combined = await reader.get({ ...input, messageId: "10" });
    assert.equal(combined?.parts?.length, 3);
    assert.equal(await groups.current(combined!), true);
    assert.equal(
      await reader.get({ ...input, messageId: "11" }),
      null,
      "members cannot publish separately",
    );
    await groups.invalidate({ ...input, messageId: "12" });
    assert.equal(
      await groups.current(combined!),
      false,
      "late extraction version is obsolete",
    );
    await collection.save(combined!, "old", null, "pending");
    assert.equal(
      await store
        .database()
        .collection("discord_collected_messages")
        .countDocuments(),
      0,
    );
    excluded = true;
    assert.equal(await reader.get({ ...input, messageId: "10" }), null);
    excluded = false;
    const updated = await reader.get({ ...input, messageId: "10" });
    await policy.apply({
      interactionId: "103",
      guildId: "3",
      channelId: "4",
      actorId: "5",
      action: "ignore",
      messageId: "11",
    });
    assert.equal(await groups.current(updated!), false);
    assert.equal(await reader.get({ ...input, messageId: "10" }), null);
  } finally {
    await store.mongoClient?.close();
    await mongo.stop();
  }
});

test("image downloads only accept bounded Discord attachments and matching image bytes", async () => {
  const image: DiscordImageAttachment = {
    id: "1",
    messageId: "2",
    channelId: "3",
    url: "https://cdn.discordapp.com/attachments/3/1/flyer.png?ex=123",
    mimeType: "image/png",
    size: 8,
  };
  assert.equal(validDiscordImage(image), true);
  for (const url of [
    "https://evil.test/flyer.png",
    "http://cdn.discordapp.com/attachments/3/1/a.png",
    "https://cdn.discordapp.com/attachments/9/1/a.png",
    "https://cdn.discordapp.com@localhost/attachments/3/1/a.png",
  ])
    assert.equal(validDiscordImage({ ...image, url }), false);
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const transport: typeof fetch = async (_url, init) => {
    assert.equal(init?.redirect, "error");
    assert.equal(init?.headers, undefined);
    return new Response(png, { headers: { "content-type": "image/png" } });
  };
  const data = await downloadDiscordImages([image], transport);
  assert.equal(data[0].attachmentId, "1");
  await assert.rejects(downloadDiscordImages(Array(4).fill(image), transport));
  await assert.rejects(
    downloadDiscordImages([{ ...image, size: 5 * 1024 * 1024 }], transport),
  );
  await assert.rejects(
    downloadDiscordImages(
      [image],
      async () =>
        new Response("not an image", {
          headers: { "content-type": "image/png" },
        }),
    ),
  );
});

test("grouped relative dates use the source message's original timestamp", () => {
  const candidate = {
    date: "2026-09-21",
    dateMessageId: "2",
    dateReasoning: "Tomorrow from September 20",
    title: "Chess",
    description: "",
    location: "Squires",
    onlineUrl: null,
    isOnline: false,
    evidence: {
      date: "tomorrow",
      title: "Chess",
      location: "Squires",
      online: null,
    },
  };
  const context = {
    postedAt: "2026-09-19T12:00:00Z",
    timezone: "America/New_York",
    messages: [
      {
        messageId: "1",
        text: "Chess",
        createdAt: "2026-09-19T12:00:00Z",
        sourceUrl: "",
      },
      {
        messageId: "2",
        text: "tomorrow at Squires",
        createdAt: "2026-09-20T12:00:00Z",
        sourceUrl: "",
      },
    ],
  };
  assert.ok(
    validateDiscordCandidate(candidate, "Chess tomorrow at Squires", context),
  );
  assert.equal(
    validateDiscordCandidate(
      { ...candidate, dateMessageId: "1" },
      "Chess tomorrow at Squires",
      context,
    ),
    null,
  );
});
