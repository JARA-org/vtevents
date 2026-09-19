import { randomBytes } from "node:crypto";
import { database } from "./store.js";
import { config, remote, HttpError } from "./config.js";
import { seal, unseal, hash } from "./security.js";
import { configuredChannels } from "./discord-policy.js";
const api = "https://discord.com/api/v10";
const redirect = () => config.origin + "/api/connections/discord/callback";
export function discordReady() {
  return !!(
    process.env.DISCORD_CLIENT_ID &&
    process.env.DISCORD_CLIENT_SECRET &&
    process.env.DISCORD_BOT_TOKEN &&
    process.env.TOKEN_ENCRYPTION_KEY
  );
}
export async function discordStart(userId: string) {
  if (!discordReady())
    throw new HttpError(
      503,
      "Discord needs a configured bot and server administrator authorization.",
    );
  const state = randomBytes(32).toString("base64url");
  await database()
    .collection("oauth_states")
    .insertOne({
      stateHash: hash(state),
      userId,
      provider: "discord",
      expiresAt: new Date(Date.now() + 600000),
    });
  return (
    "https://discord.com/oauth2/authorize?" +
    new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      redirect_uri: redirect(),
      response_type: "code",
      scope: "identify guilds",
      state,
    })
  );
}
export async function discordFinish(
  userId: string,
  state: string,
  code: string,
) {
  const row = await database()
    .collection("oauth_states")
    .findOneAndDelete({
      stateHash: hash(state),
      userId,
      provider: "discord",
      expiresAt: { $gt: new Date() },
    });
  if (!row) throw new HttpError(400, "Discord connection request expired.");
  const t = await (
    await remote(api + "/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect(),
      }),
    })
  ).json();
  await database()
    .collection("connections")
    .updateOne(
      { userId, provider: "discord" },
      {
        $set: {
          encrypted: seal(t),
          status: "connected",
          lastSync: null,
          channels: [],
        },
      },
      { upsert: true },
    );
}
const authorizedChannels = configuredChannels;
export async function discordChannels(userId: string) {
  return authorizedChannels(userId);
}
export async function selectDiscordChannels(
  userId: string,
  selected: string[],
) {
  const allowed = await authorizedChannels(userId);
  if (selected.some((id) => !allowed.some((c) => c.id === id)))
    throw new HttpError(
      403,
      "Only administrator-authorized announcement channels in your servers may be selected.",
    );
  await database()
    .collection("connections")
    .updateOne(
      { userId, provider: "discord" },
      { $set: { channels: selected } },
    );
}
export async function syncDiscord(userId: string) {
  const row = await database()
    .collection("connections")
    .findOne({ userId, provider: "discord" });
  const allowed = await authorizedChannels(userId);
  const selected = allowed.filter((c) => row?.channels?.includes(c.id));
  const announcements = [];
  for (const channel of selected) {
    const messages = await (
      await remote(api + `/channels/${channel.id}/messages?limit=25`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      })
    ).json();
    for (const message of messages) {
      if (message.content)
        announcements.push({
          id: message.id,
          channel: channel.name,
          text: String(message.content).slice(0, 2000),
          url: `https://discord.com/channels/${channel.guildId}/${channel.id}/${message.id}`,
          timestamp: message.timestamp,
        });
    }
  }
  await database()
    .collection("private_context")
    .updateOne(
      { userId, provider: "discord" },
      { $set: { encrypted: seal({ announcements }), syncedAt: new Date() } },
      { upsert: true },
    );
  await database()
    .collection("connections")
    .updateOne(
      { userId, provider: "discord" },
      { $set: { lastSync: new Date(), status: "connected" } },
    );
  return { announcements: announcements.length };
}
