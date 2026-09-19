import test from "node:test";
import assert from "node:assert/strict";
import { runDiscordWorkers } from "../apps/backend/src/discord-jobs.js";
import { discordExtractionLimits } from "../apps/backend/src/discord-limits.js";

test("Discord workers overlap three jobs, bound concurrency, and drain remaining work", async () => {
  const jobs = Array.from({ length: 8 }, (_, i) => ({
    guildId: "1",
    channelId: "2",
    messageId: String(i),
    revision: String(i),
    leaseOwner: String(i),
  }));
  let active = 0,
    peak = 0,
    completed = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  await runDiscordWorkers(
    { claim: async () => jobs.shift() || null },
    async () => {
      active++;
      peak = Math.max(peak, active);
      if (active === 3) release();
      await barrier;
      active--;
      completed++;
    },
  );
  assert.equal(peak, 3);
  assert.equal(completed, 8);
});

test("worker failure waits for other active jobs before reporting failure", async () => {
  let index = 0,
    completed = 0;
  await assert.rejects(
    runDiscordWorkers(
      {
        claim: async () => {
          const i = index++;
          return i < 3
            ? {
                guildId: "1",
                channelId: "2",
                messageId: String(i),
                revision: "r",
                leaseOwner: "l",
              }
            : null;
        },
      },
      async (job) => {
        if (job.messageId === "0") throw new Error("storage unavailable");
        await new Promise((resolve) => setTimeout(resolve, 10));
        completed++;
      },
    ),
    /storage unavailable/,
  );
  assert.equal(completed, 2);
});

test("Discord defaults are server-only 20 per day and 5 per hour", () => {
  const names = [
    "DISCORD_AI_GUILD_DAILY_LIMIT",
    "DISCORD_AI_GUILD_HOURLY_LIMIT",
  ];
  const previous = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    const limits = discordExtractionLimits();
    assert.equal(limits.serverOnly, true);
    assert.equal(limits.guildDaily, 20);
    assert.equal(limits.guildHourly, 5);
  } finally {
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    });
  }
});
