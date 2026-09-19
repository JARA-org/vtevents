import { z } from "zod";
import type {
  DiscordMessageReader,
  DiscordReadTarget,
  DiscordCollectedMessage,
} from "../../../packages/shared/src/contracts.js";
const id = z.string().regex(/^\d{1,20}$/);
const message = z.object({
  id,
  channel_id: id,
  content: z.string().max(20000),
  timestamp: z.string().datetime({ offset: true }),
  edited_timestamp: z.string().datetime({ offset: true }).nullable(),
  type: z.number(),
});
export class DiscordReadError extends Error {
  constructor(public status: number) {
    super(`Discord read unavailable (${status})`);
  }
}
/** All provider access is GET to fixed Discord paths. Never follows message URLs or mutates Discord. */
export function createDiscordReader(
  token: string,
  transport: typeof fetch = fetch,
): DiscordMessageReader {
  let blockedUntil = 0;
  async function get(path: string) {
    if (Date.now() < blockedUntil) throw new DiscordReadError(429);
    const response = await transport(`https://discord.com/api/v10${path}`, {
      method: "GET",
      headers: { Authorization: `Bot ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      const seconds = Number(
        response.headers.get("retry-after") || body.retry_after || 60,
      );
      blockedUntil =
        Date.now() +
        (Number.isFinite(seconds) ? Math.max(1, seconds) : 60) * 1000;
    }
    if (!response.ok) throw new DiscordReadError(response.status); // 429 aborts the poll; never loops/retries aggressively.
    return response.json();
  }
  async function channel(target: DiscordReadTarget) {
    id.parse(target.channelId);
    id.parse(target.guildId);
    const value = z
      .object({ id, guild_id: id, type: z.number() })
      .parse(await get(`/channels/${target.channelId}`));
    if (
      value.id !== target.channelId ||
      value.guild_id !== target.guildId ||
      ![0, 5, 10, 11, 12].includes(value.type)
    )
      throw new DiscordReadError(403);
  }
  function normalize(
    raw: unknown,
    target: DiscordReadTarget,
  ): DiscordCollectedMessage {
    const value = message.parse(raw);
    if (value.channel_id !== target.channelId) throw new DiscordReadError(403);
    return {
      guildId: target.guildId,
      channelId: target.channelId,
      messageId: value.id,
      text: [0, 19].includes(value.type) ? value.content : "",
      createdAt: value.timestamp,
      editedAt: value.edited_timestamp,
      sourceUrl: `https://discord.com/channels/${target.guildId}/${target.channelId}/${value.id}`,
    };
  }
  return {
    async list(target, before) {
      await channel(target);
      if (before) id.parse(before);
      const raw = z
        .array(z.unknown())
        .max(100)
        .parse(
          await get(
            `/channels/${target.channelId}/messages?limit=100${before ? "&before=" + before : ""}`,
          ),
        );
      return raw
        .map((r) => normalize(r, target))
        .sort((a, b) => (BigInt(a.messageId) > BigInt(b.messageId) ? -1 : 1));
    },
    async get(target) {
      if (!target.messageId) throw new Error("Message ID required");
      id.parse(target.messageId);
      await channel(target);
      try {
        const result = normalize(
          await get(
            `/channels/${target.channelId}/messages/${target.messageId}`,
          ),
          target,
        );
        if (result.messageId !== target.messageId)
          throw new DiscordReadError(403);
        return result;
      } catch (e) {
        if (e instanceof DiscordReadError && e.status === 404) return null;
        throw e;
      }
    },
  };
}
