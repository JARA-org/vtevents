import { database } from "./store.js";
import { remote, HttpError } from "./config.js";
import { unseal } from "./security.js";
const api = "https://discord.com/api/v10";
const view = 1024n;
const botGet = async (path: string) =>
  (
    await remote(api + path, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    })
  ).json();
async function userToken(userId: string) {
  const row = await database()
    .collection("connections")
    .findOne({ userId, provider: "discord" });
  if (!row) throw new HttpError(409, "Connect Discord first.");
  return unseal(row.encrypted).access_token;
}
export async function memberGuilds(userId: string) {
  const token = await userToken(userId),
    guilds: any[] = [];
  let after = "";
  for (let page = 0; page < 5; page++) {
    const batch = await (
      await remote(
        api + "/users/@me/guilds?limit=200" + (after ? "&after=" + after : ""),
        { headers: { Authorization: `Bearer ${token}` } },
      )
    ).json();
    if (!Array.isArray(batch))
      throw new HttpError(502, "Discord server list unavailable.");
    guilds.push(...batch);
    if (batch.length < 200) return guilds;
    after = batch[batch.length - 1].id;
  }
  throw new HttpError(502, "Discord server list exceeded the supported limit.");
}
// V1 supports announcements visible to every server member. Fail closed on
// any view-denying overwrite; private role/member channels need richer consent.
export function memberVisibleAnnouncement(
  channel: any,
  guildId: string,
  roles: any[],
) {
  try {
    return (
      channel.type === 5 &&
      channel.guild_id === guildId &&
      !!(
        BigInt(roles.find((r) => r.id === guildId)?.permissions || "0") & view
      ) &&
      Array.isArray(channel.permission_overwrites) &&
      channel.permission_overwrites.every(
        (o: any) => (BigInt(o.deny || "0") & view) === 0n,
      )
    );
  } catch {
    return false;
  }
}
async function publicChannels(guildId: string) {
  const [channels, roles] = await Promise.all([
    botGet(`/guilds/${guildId}/channels`),
    botGet(`/guilds/${guildId}/roles`),
  ]);
  if (!Array.isArray(channels) || !Array.isArray(roles))
    throw new HttpError(502, "Discord channels unavailable.");
  return channels
    .filter((c) => memberVisibleAnnouncement(c, guildId, roles))
    .map((c) => ({ id: c.id, name: c.name, guildId }));
}
async function requireOwner(userId: string, guildId: string) {
  const guild = (await memberGuilds(userId)).find(
    (g) => g.id === guildId && g.owner === true,
  );
  if (!guild)
    throw new HttpError(
      403,
      "Only this Discord server's current owner can configure Gobbler.",
    );
  return guild;
}
export async function ownerGuilds(userId: string) {
  return (await memberGuilds(userId))
    .filter((g) => g.owner === true)
    .map((g) => ({ id: g.id, name: g.name }));
}
export async function ownerChannels(userId: string, guildId: string) {
  await requireOwner(userId, guildId);
  const channels = await publicChannels(guildId);
  const row = await database()
    .collection("discord_guilds")
    .findOne({ guildId });
  return { channels, selected: row?.channels || [] };
}
export async function configureGuild(
  userId: string,
  guildId: string,
  selected: string[],
) {
  await requireOwner(userId, guildId);
  const channels = selected.length ? await publicChannels(guildId) : [];
  if (selected.some((id) => !channels.some((c) => c.id === id)))
    throw new HttpError(
      403,
      "Choose only announcement channels visible to every server member.",
    );
  const guild = await botGet(`/guilds/${guildId}`);
  const token = await userToken(userId);
  const identity = await (
    await remote(api + "/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  if (identity.id !== guild.owner_id)
    throw new HttpError(
      403,
      "Server ownership changed. Reconnect and try again.",
    );
  await database()
    .collection("discord_guilds")
    .updateOne(
      { guildId },
      {
        $set: {
          userId,
          ownerDiscordId: guild.owner_id,
          channels: [...new Set(selected)],
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  // Clear cached private announcements on policy changes, including revocation.
  await database()
    .collection("private_context")
    .deleteMany({ provider: "discord" });
}
export async function configuredChannels(userId: string) {
  const guilds = await memberGuilds(userId),
    ids = guilds.map((g) => g.id);
  const rows = await database()
    .collection("discord_guilds")
    .find({ guildId: { $in: ids } })
    .limit(51)
    .toArray();
  if (rows.length > 50)
    throw new HttpError(
      502,
      "Too many configured servers; narrow your connections.",
    );
  const result: { id: string; name: string; guildId: string }[] = [];
  for (const row of rows) {
    const guild = await botGet(`/guilds/${row.guildId}`);
    if (guild.owner_id !== row.ownerDiscordId) continue;
    const channels = await publicChannels(row.guildId);
    result.push(...channels.filter((c) => row.channels.includes(c.id)));
  }
  return result;
}
