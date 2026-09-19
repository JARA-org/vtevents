import { Client, Events, GatewayIntentBits, Options } from "discord.js";
import { z } from "zod";
import type {
  DiscordMessageTrigger,
  DiscordCollectionInspection,
} from "../../../packages/shared/src/contracts.js";
const snowflake = z.string().regex(/^\d{1,20}$/);
const packet = z.object({
  t: z.enum([
    "MESSAGE_CREATE",
    "MESSAGE_UPDATE",
    "MESSAGE_DELETE",
    "MESSAGE_DELETE_BULK",
  ]),
  d: z.object({
    guild_id: snowflake,
    channel_id: snowflake,
    id: snowflake.optional(),
    ids: z.array(snowflake).max(100).optional(),
    content: z.string().optional(),
    edited_timestamp: z.string().nullable().optional(),
    attachments: z.array(z.unknown()).optional(),
  }),
});
/** Gateway data is untrusted transport. Return IDs only; never retain message text/embeds/attachments. */
export function discordMessageTriggers(
  value: unknown,
): DiscordMessageTrigger[] {
  const parsed = packet.safeParse(value);
  if (!parsed.success) return [];
  const { t, d } = parsed.data;
  // Embed-only/link-preview updates do not trigger extraction.
  if (
    t === "MESSAGE_UPDATE" &&
    d.content === undefined &&
    !d.edited_timestamp &&
    d.attachments === undefined
  )
    return [];
  return (t === "MESSAGE_DELETE_BULK" ? d.ids || [] : d.id ? [d.id] : []).map(
    (messageId) => ({
      guildId: d.guild_id,
      channelId: d.channel_id,
      messageId,
      kind: t.startsWith("MESSAGE_DELETE") ? "delete" : "upsert",
    }),
  );
}
/** Persistent outbound Gateway connection; SDK owns heartbeat/resume/reconnect. No channel/message/provider mutations. */
export function startDiscordGateway(
  token: string,
  onMessage: (event: DiscordMessageTrigger) => Promise<void>,
  onState: (
    state: NonNullable<DiscordCollectionInspection["listenerStatus"]>,
  ) => void,
) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 0,
    }),
    allowedMentions: { parse: [] },
  });
  client.on(Events.Raw, (packet) => {
    for (const event of discordMessageTriggers(packet))
      void onMessage(event).catch(() => console.warn("discord_trigger_failed"));
  });
  client.on(Events.ClientReady, () => onState("connected"));
  client.on(Events.ShardResume, () => onState("connected"));
  client.on(Events.ShardDisconnect, () => onState("disconnected"));
  client.on(Events.Error, () => onState("error"));
  client.on(Events.ShardError, () => onState("error"));
  onState("starting");
  void client.login(token).catch(() => {
    onState("error");
    console.warn(
      "discord_gateway_unavailable: check bot token and Message Content Intent",
    );
  });
  return {
    stop: async () => {
      await client.destroy();
      onState("disabled");
    },
  };
}
