import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
test("Discord server owner authorization, channel visibility and revocation", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.DISCORD_BOT_TOKEN = "test-bot";
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const { seal } = await import("../apps/backend/src/security.js");
  const policy = await import("../apps/backend/src/discord-policy.js");
  for (const id of ["owner", "member", "outsider"])
    await store
      .database()
      .collection("connections")
      .insertOne({
        userId: id,
        provider: "discord",
        encrypted: seal({ access_token: id }),
      });
  const original = global.fetch;
  let currentOwner = "discord-owner",
    deny = false;
  global.fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const token = new Headers(init?.headers).get("Authorization");
    let result: any;
    if (path.endsWith("/users/@me/guilds"))
      result =
        token === "Bearer outsider"
          ? []
          : [{ id: "1", name: "Campus", owner: token === "Bearer owner" }];
    else if (path.endsWith("/users/@me")) result = { id: "discord-owner" };
    else if (path.endsWith("/guilds/1/roles"))
      result = [{ id: "1", permissions: "1024" }];
    else if (path.endsWith("/guilds/1/channels"))
      result = [
        {
          id: "2",
          guild_id: "1",
          type: 5,
          name: "news",
          permission_overwrites: deny ? [{ deny: "1024" }] : [],
        },
        {
          id: "3",
          guild_id: "1",
          type: 5,
          name: "private",
          permission_overwrites: [{ deny: "1024" }],
        },
        {
          id: "4",
          guild_id: "1",
          type: 0,
          name: "chat",
          permission_overwrites: [],
        },
      ];
    else if (path.endsWith("/guilds/1"))
      result = { id: "1", owner_id: currentOwner };
    else throw new Error("Unexpected mock endpoint");
    return Response.json(result);
  };
  try {
    assert.equal((await policy.ownerGuilds("owner")).length, 1);
    assert.equal((await policy.ownerGuilds("member")).length, 0);
    await assert.rejects(
      policy.configureGuild("member", "1", ["2"]),
      /current owner/,
    );
    await assert.rejects(
      policy.configureGuild("owner", "9", ["2"]),
      /current owner/,
    );
    await assert.rejects(policy.configureGuild("owner", "1", ["3"]), /visible/);
    await assert.rejects(policy.configureGuild("owner", "1", ["4"]), /visible/);
    assert.deepEqual(await policy.configuredChannels("member"), []);
    await store
      .database()
      .collection("private_context")
      .insertOne({
        userId: "member",
        provider: "discord",
        encrypted: seal({ announcements: [] }),
      });
    await policy.configureGuild("owner", "1", ["2"]);
    assert.equal(
      await store.database().collection("private_context").countDocuments({}),
      0,
    );
    assert.deepEqual(
      (await policy.configuredChannels("member")).map((c) => c.id),
      ["2"],
    );
    assert.deepEqual(await policy.configuredChannels("outsider"), []);
    deny = true;
    assert.deepEqual(await policy.configuredChannels("member"), []);
    deny = false;
    currentOwner = "new-owner";
    assert.deepEqual(await policy.configuredChannels("member"), []);
    currentOwner = "discord-owner";
    await policy.configureGuild("owner", "1", []);
    assert.deepEqual(await policy.configuredChannels("member"), []);
  } finally {
    global.fetch = original;
    await store.mongoClient?.close();
    await mongo.stop();
  }
});
