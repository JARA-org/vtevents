import test from "node:test";
import assert from "node:assert/strict";
import { discordMessageTriggers } from "../apps/backend/src/discord-gateway.js";

test("Gateway adapter emits only server message IDs for posts, text edits, and deletions", () => {
  const data = {
    guild_id: "1",
    channel_id: "2",
    id: "3",
    content: "private text not retained",
  };
  assert.deepEqual(discordMessageTriggers({ t: "MESSAGE_CREATE", d: data }), [
    { guildId: "1", channelId: "2", messageId: "3", kind: "upsert" },
  ]);
  assert.equal(
    discordMessageTriggers({
      t: "MESSAGE_UPDATE",
      d: { ...data, edited_timestamp: "2026-09-19T20:00:00Z" },
    }).length,
    1,
  );
  assert.deepEqual(
    discordMessageTriggers({
      t: "MESSAGE_UPDATE",
      d: { guild_id: "1", channel_id: "2", id: "3", embeds: [{}] },
    }),
    [],
  );
  assert.deepEqual(
    discordMessageTriggers({
      t: "MESSAGE_CREATE",
      d: { channel_id: "2", id: "3", content: "DM" },
    }),
    [],
  );
  assert.deepEqual(
    discordMessageTriggers({
      t: "MESSAGE_CREATE",
      d: { ...data, id: "../invalid" },
    }),
    [],
  );
  assert.equal(
    discordMessageTriggers({ t: "MESSAGE_DELETE", d: data })[0].kind,
    "delete",
  );
  assert.equal(
    discordMessageTriggers({
      t: "MESSAGE_DELETE_BULK",
      d: { guild_id: "1", channel_id: "2", ids: ["3", "4"] },
    }).length,
    2,
  );
  assert.deepEqual(discordMessageTriggers({ t: "TYPING_START", d: data }), []);
});
