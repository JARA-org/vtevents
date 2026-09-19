import express, { type Express } from "express";
import {
  verifyDiscordRequest,
  handleDiscordInteraction,
} from "./discord-bot.js";
import { discordBotRepository } from "./discord-bot-store.js";
import { discordInspection } from "./discord-collection-store.js";
import { discordClubSetup } from "./club-accounts.js";

/** Discord-signed transport. Mount before the browser JSON/Origin middleware; no cookie/session authorization. */
export function registerDiscordBotRoutes(app: Express) {
  app.post(
    "/api/discord/interactions",
    express.raw({ type: "application/json", limit: "64kb" }),
    async (req, res) => {
      const key = process.env.DISCORD_PUBLIC_KEY;
      const applicationId = process.env.DISCORD_CLIENT_ID;
      if (!key || !applicationId)
        return res
          .status(503)
          .json({ message: "Discord bot is not configured." });
      if (
        !Buffer.isBuffer(req.body) ||
        !verifyDiscordRequest(
          req.body,
          req.get("X-Signature-Ed25519") || "",
          req.get("X-Signature-Timestamp") || "",
          key,
        )
      )
        return res.status(401).json({ message: "Invalid Discord signature." });
      let input: unknown;
      try {
        input = JSON.parse(req.body.toString("utf8"));
      } catch {
        return res.status(400).json({ message: "Invalid interaction JSON." });
      }
      res.setHeader("Cache-Control", "no-store");
      try {
        res.json(
          await handleDiscordInteraction(
            input,
            applicationId,
            discordBotRepository,
            discordInspection,
            discordClubSetup,
          ),
        );
      } catch {
        // Never claim success or expose storage errors. Writes retain persistent receipts.
        res.json({
          type: 4,
          data: {
            content:
              "Gobbler could not confirm this change. Please retry the command.",
            flags: 64,
            allowed_mentions: { parse: [] },
          },
        });
      }
    },
  );
}
