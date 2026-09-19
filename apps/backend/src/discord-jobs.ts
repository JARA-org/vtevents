import { db } from "./store.js";
import { discordBotRepository } from "./discord-bot-store.js";
import { discordCollectionRepository } from "./discord-collection-store.js";
import { createDiscordReader } from "./discord-reader.js";
import { createDiscordExtractor } from "./discord-extractor.js";
import { collectDiscordMessages } from "./discord-collector.js";
let pending: Promise<unknown> | undefined;
let reader: ReturnType<typeof createDiscordReader> | undefined;
export function runDiscordCollection() {
  if (pending) return pending;
  if (
    !db ||
    process.env.DISCORD_COLLECTION_ENABLED !== "true" ||
    !process.env.DISCORD_BOT_TOKEN
  )
    return Promise.resolve();
  reader ||= createDiscordReader(process.env.DISCORD_BOT_TOKEN);
  const requested = Number(process.env.DISCORD_AI_DAILY_LIMIT || 20);
  const dailyLimit = Number.isFinite(requested)
    ? Math.max(0, Math.min(100, Math.floor(requested)))
    : 0;
  const extractor =
    process.env.DISCORD_AI_ENABLED === "true" && process.env.GEMINI_API_KEY
      ? createDiscordExtractor(
          process.env.GEMINI_API_KEY,
          process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
        )
      : undefined;
  pending = collectDiscordMessages({
    policy: discordBotRepository,
    store: discordCollectionRepository,
    reader,
    extractor,
    dailyLimit,
  })
    .then((summary) => {
      console.log("discord_collection", summary);
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
