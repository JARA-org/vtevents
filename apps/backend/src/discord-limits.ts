import type { DiscordExtractionLimits } from "../../../packages/shared/src/contracts.js";
const bounded = (
  value: string | undefined,
  fallback: number,
  ceiling: number,
) => {
  const n = value === undefined || value === "" ? fallback : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(ceiling, Math.floor(n))) : 0;
};
/** Server-owned policy; invalid settings fail closed. No provider or model calls. */
export function discordExtractionLimits(): DiscordExtractionLimits {
  return {
    serverOnly: true,
    // Legacy DTO fields; not enforced under serverOnly. No app or message spending cap.
    globalDaily: 20,
    guildDaily: bounded(process.env.DISCORD_AI_GUILD_DAILY_LIMIT, 20, 20),
    guildHourly: bounded(process.env.DISCORD_AI_GUILD_HOURLY_LIMIT, 5, 5),
    messageDaily: 2,
  };
}
