import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import type { DiscordBotRepository } from "../../../packages/shared/src/contracts.js";

const snowflake = z.string().regex(/^\d{1,20}$/);
const schema = z.object({
  id: snowflake.optional(),
  application_id: snowflake,
  type: z.number(),
  guild_id: snowflake.optional(),
  channel_id: snowflake.optional(),
  channel: z.object({ id: snowflake, type: z.number() }).optional(),
  member: z
    .object({
      user: z.object({ id: snowflake }),
      permissions: z.string().regex(/^\d+$/),
    })
    .optional(),
  app_permissions: z.string().regex(/^\d+$/).optional(),
  data: z
    .object({
      name: z.string(),
      type: z.number(),
      target_id: snowflake.optional(),
      resolved: z
        .object({
          messages: z.record(
            z.string(),
            z.object({
              id: snowflake,
              channel_id: snowflake,
              content: z.string().optional(),
            }),
          ),
        })
        .optional(),
      options: z
        .array(
          z.object({
            name: z.string(),
            type: z.number(),
            options: z
              .array(
                z.object({
                  name: z.string(),
                  type: z.number(),
                  value: z.boolean(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});
const reply = (content: string) => ({
  type: 4,
  data: { content, flags: 64, allowed_mentions: { parse: [] as string[] } },
});

/** Verify exact raw request bytes, Discord signature, and bounded timestamp. No JSON parsing before verification. */
export function verifyDiscordRequest(
  body: Buffer,
  signature: string,
  timestamp: string,
  publicKey: string,
  now = Date.now(),
) {
  if (
    !/^[a-f\d]{128}$/i.test(signature) ||
    !/^[a-f\d]{64}$/i.test(publicKey) ||
    !/^\d{10}$/.test(timestamp)
  )
    return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(publicKey, "hex"),
      ]),
      format: "der",
      type: "spki",
    });
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp), body]),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

/** No AI: exclusion is exact, case-insensitive marker matching, never model interpretation. */
export function excludedDiscordText(text: string) {
  return /\[no-ai\]/i.test(text);
}

/** For a future collector: check this before persisting text or calling extraction. No AI or provider writes. */
export async function eligibleDiscordMessage(
  repository: DiscordBotRepository,
  input: {
    guildId: string;
    channelId: string;
    messageId: string;
    text: string;
  },
) {
  return !excludedDiscordText(input.text) && repository.eligible(input);
}

/** Called only after signature verification. Discord-signed permissions, not command visibility alone, authorize every mutation. */
export async function handleDiscordInteraction(
  value: unknown,
  applicationId: string,
  repository: DiscordBotRepository,
) {
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data.application_id !== applicationId)
    return reply("Invalid Discord interaction.");
  const input = parsed.data;
  if (input.type === 1) return { type: 1 };
  if (
    input.type !== 2 ||
    !input.id ||
    !input.guild_id ||
    !input.channel_id ||
    !input.member ||
    !input.data
  )
    return reply("Use this command inside a server channel.");
  const permissions = BigInt(input.member.permissions);
  if (!(permissions & (8n | 32n)))
    return reply("Manage Server permission is required.");
  const base = {
    interactionId: input.id,
    guildId: input.guild_id,
    channelId: input.channel_id,
    actorId: input.member.user.id,
  };
  if (
    input.data.type === 3 &&
    ["Ignore for Gobbler", "Submit to Gobbler (public)"].includes(
      input.data.name,
    )
  ) {
    const target = input.data.target_id;
    const message = target && input.data.resolved?.messages?.[target];
    if (
      !message ||
      message.id !== target ||
      message.channel_id !== input.channel_id
    )
      return reply("Choose a message in this channel.");
    const submitting = input.data.name === "Submit to Gobbler (public)";
    if (submitting) {
      const bot = BigInt(input.app_permissions || "0");
      if ((bot & (1024n | 65536n)) !== (1024n | 65536n) && !(bot & 8n))
        return reply(
          "The bot needs View Channel and Read Message History to read this message.",
        );
      if (excludedDiscordText(message.content || ""))
        return reply("This message contains [no-ai] and cannot be submitted.");
    }
    return reply(
      (
        await repository.apply({
          ...base,
          action: submitting ? "submit" : "ignore",
          messageId: target,
        })
      ).content,
    );
  }
  if (
    input.data.type !== 1 ||
    input.data.name !== "gobbler" ||
    input.data.options?.length !== 1
  )
    return reply("Unknown Gobbler command.");
  const option = input.data.options[0];
  if (option.type !== 1 || !["watch", "unwatch"].includes(option.name))
    return reply("Unknown Gobbler command.");
  if (option.name === "watch") {
    if (
      !option.options?.some(
        (o) => o.name === "public" && o.type === 5 && o.value === true,
      )
    )
      return reply(
        "Watching requires public:true: eligible messages may be published outside Discord. No Discord settings are changed.",
      );
    if (
      !input.channel ||
      input.channel.id !== input.channel_id ||
      ![0, 5].includes(input.channel.type)
    )
      return reply("Watch a server text or announcement channel.");
    const bot = BigInt(input.app_permissions || "0");
    if ((bot & (1024n | 65536n)) !== (1024n | 65536n) && !(bot & 8n))
      return reply("The bot needs View Channel and Read Message History here.");
  }
  return reply(
    (
      await repository.apply({
        ...base,
        action: option.name as "watch" | "unwatch",
      })
    ).content,
  );
}

/** Registered explicitly by the setup script; no remote effects on application startup. */
export const discordBotCommands = [
  {
    name: "gobbler",
    description: "Choose what Gobbler may read; never change Discord settings",
    type: 1,
    default_member_permissions: "32",
    contexts: [0],
    integration_types: [0],
    options: [
      {
        name: "watch",
        description:
          "Read this channel's messages as public input, except opt-outs",
        type: 1,
        options: [
          {
            name: "public",
            description:
              "I agree eligible announcements may be published outside Discord",
            type: 5,
            required: true,
          },
        ],
      },
      {
        name: "unwatch",
        description:
          "Stop automatic reading; individual submissions remain separate",
        type: 1,
      },
    ],
  },
  {
    name: "Submit to Gobbler (public)",
    type: 3,
    default_member_permissions: "32",
    contexts: [0],
    integration_types: [0],
  },
  {
    name: "Ignore for Gobbler",
    type: 3,
    default_member_permissions: "32",
    contexts: [0],
    integration_types: [0],
  },
];
