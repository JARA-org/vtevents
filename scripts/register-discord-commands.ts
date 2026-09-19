import "dotenv/config";
import { discordBotCommands } from "../apps/backend/src/discord-bot.js";

// Explicit setup operation. Default only previews; --apply registers these named commands.
if (!process.argv.includes("--apply")) {
  console.log(JSON.stringify(discordBotCommands, null, 2));
} else {
  const applicationId = process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_TEST_GUILD_ID;
  if (
    !applicationId ||
    !/^\d{1,20}$/.test(applicationId) ||
    !token ||
    (guildId && !/^\d{1,20}$/.test(guildId))
  )
    throw new Error(
      "Set DISCORD_CLIENT_ID, DISCORD_BOT_TOKEN, and optionally DISCORD_TEST_GUILD_ID.",
    );
  const path = guildId
    ? `applications/${applicationId}/guilds/${guildId}/commands`
    : `applications/${applicationId}/commands`;
  for (const command of discordBotCommands) {
    const response = await fetch(`https://discord.com/api/v10/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Discord registration failed (${response.status}); no automatic retry.`,
      );
    console.log(
      `Registered ${command.name} (${guildId ? "test server" : "global"}).`,
    );
  }
}
