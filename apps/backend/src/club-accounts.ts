import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { ClientSession } from "mongodb";
import { ObjectId } from "mongodb";
import type {
  ClubAccountService,
  DiscordClubSetupService,
  ManagedClub,
  CampusEvent,
  DiscordEventCandidate,
} from "../../../packages/shared/src/contracts.js";
import { database, mongoClient } from "./store.js";
import { config, HttpError } from "./config.js";
const clubs = () =>
  database().collection<{
    _id: string;
    name: string;
    ownerId: string;
    requestId: string;
    discordGuildId: string | null;
  }>("managed_clubs");
const tickets = () =>
  database().collection<{
    _id: string;
    guildId: string;
    actorId: string;
    expiresAt: Date;
    userId?: string;
    clubId?: string;
  }>("club_discord_tickets");
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const digest = (token: string) =>
  createHash("sha256").update(tokenSchema.parse(token)).digest("hex");
const dto = (club: {
  _id: string;
  name: string;
  discordGuildId: string | null;
}): ManagedClub => ({
  id: club._id,
  name: club.name,
  discordGuildId: club.discordGuildId,
});
async function bind(
  userId: string,
  clubId: string,
  token: string,
  session: ClientSession,
) {
  const ticket = await tickets().findOne({ _id: digest(token) }, { session });
  if (!ticket)
    throw new HttpError(
      400,
      "Invalid Discord setup link. Run /gobbler setup again.",
    );
  const club = await clubs().findOne(
    { _id: clubId, ownerId: userId },
    { session },
  );
  if (!club) throw new HttpError(403, "You do not manage this club.");
  if (ticket.userId) {
    if (
      ticket.userId === userId &&
      ticket.clubId === clubId &&
      club.discordGuildId === ticket.guildId
    )
      return dto(club);
    throw new HttpError(409, "This setup link has already been used.");
  }
  if (ticket.expiresAt.getTime() <= Date.now())
    throw new HttpError(400, "Setup link expired. Run /gobbler setup again.");
  if (club.discordGuildId && club.discordGuildId !== ticket.guildId)
    throw new HttpError(409, "This club already has a Discord server.");
  const other = await clubs().findOne(
    { discordGuildId: ticket.guildId },
    { session },
  );
  if (other && other._id !== clubId)
    throw new HttpError(
      409,
      "This Discord server is already linked to another club.",
    );
  await clubs().updateOne(
    { _id: clubId },
    { $set: { discordGuildId: ticket.guildId } },
    { session },
  );
  await tickets().updateOne(
    { _id: ticket._id },
    { $set: { userId, clubId } },
    { session },
  );
  return dto({ ...club, discordGuildId: ticket.guildId });
}
async function transaction<T>(
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  if (!mongoClient) throw new HttpError(503, "Account storage unavailable.");
  const session = mongoClient.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new HttpError(
        409,
        "This club or server was just linked. Refresh and try again.",
      );
    throw error;
  } finally {
    await session.endSession();
  }
}
export const clubAccounts: ClubAccountService = {
  /** Identity and display name only. Never ownerId, guild binding or ticket state. */
  async identities(limit = 200) {
    const rows = await clubs()
      .find({}, { projection: { _id: 1, name: 1 } })
      .sort({ name: 1 })
      .limit(Math.max(1, Math.min(500, limit)))
      .toArray();
    return rows
      .filter((row) => typeof row.name === "string" && !!row.name.trim())
      .map((row) => ({ clubId: String(row._id), name: row.name }));
  },
  async list(userId) {
    const owned = await clubs()
      .find({ ownerId: userId })
      .sort({ name: 1 })
      .toArray();
    return {
      clubs: owned.map(dto),
      canCreate: owned.length === 0,
    };
  },
  async create(userId, value) {
    const input = z
      .object({
        name: z.string().trim().min(2).max(100),
        requestId: z.string().min(8).max(100),
        discordTicket: tokenSchema.optional(),
      })
      .strict()
      .parse(value);
    return transaction(async (session) => {
      // Serialize creation per owner, including different request IDs/tabs.
      // Existing duplicate records are preserved; no additional club can be created.
      await database()
        .collection<{ _id: string; revision: number }>("club_creation_locks")
        .updateOne(
          { _id: userId },
          { $inc: { revision: 1 } },
          { upsert: true, session },
        );
      const prior = await clubs().findOne(
        { ownerId: userId, requestId: input.requestId },
        { session },
      );
      if (prior) {
        if (prior.name !== input.name)
          throw new HttpError(
            409,
            "This request was already used for another club name.",
          );
        return input.discordTicket
          ? bind(userId, prior._id, input.discordTicket, session)
          : dto(prior);
      }
      if (await clubs().findOne({ ownerId: userId }, { session }))
        throw new HttpError(
          409,
          "Your account already has a club. Open your existing club workspace.",
        );
      if (!input.discordTicket)
        throw new HttpError(
          400,
          "Create your club from Discord: a server administrator must run /gobbler setup and open the private link.",
        );
      const club = {
        _id: randomUUID(),
        name: input.name,
        ownerId: userId,
        requestId: input.requestId,
        discordGuildId: null,
      };
      await clubs().insertOne(club, { session });
      return input.discordTicket
        ? bind(userId, club._id, input.discordTicket, session)
        : dto(club);
    });
  },
  async link(userId, value) {
    const input = z
      .object({ clubId: z.string().uuid(), discordTicket: tokenSchema })
      .strict()
      .parse(value);
    return transaction((session) =>
      bind(userId, input.clubId, input.discordTicket, session),
    );
  },
  async workspace(userId, clubId) {
    const club = await clubs().findOne({ _id: clubId, ownerId: userId });
    if (!club) throw new HttpError(403, "You do not manage this club.");
    const events = await database()
      .collection<CampusEvent>("events")
      .find({ clubId }, { projection: { _id: 0 } })
      .limit(200)
      .toArray();
    const rows = club.discordGuildId
      ? await database()
          .collection<{
            messageId: string;
            sourceUrl: string;
            candidate: DiscordEventCandidate;
          }>("discord_collected_messages")
          .find({ guildId: club.discordGuildId, status: "qualified" })
          .limit(200)
          .toArray()
      : [];
    return {
      club: dto(club),
      events,
      candidates: rows.map((row) => ({
        messageId: row.messageId,
        sourceUrl: row.sourceUrl,
        candidate: row.candidate,
      })),
    };
  },
};
export const discordClubSetup: DiscordClubSetupService = {
  async linked(guildId) {
    const club = await clubs().findOne({ discordGuildId: guildId });
    return (
      !!club &&
      !!(await database()
        .collection("user")
        .findOne({
          $or: [
            { id: club.ownerId },
            {
              _id: ObjectId.isValid(club.ownerId)
                ? new ObjectId(club.ownerId)
                : (club.ownerId as never),
            },
          ],
        }))
    );
  },
  async setup(input) {
    if (await discordClubSetup.linked(input.guildId))
      return { url: `${config.origin}/clubs` };
    z.object({
      guildId: z.string().regex(/^\d{1,20}$/),
      actorId: z.string().regex(/^\d{1,20}$/),
    })
      .strict()
      .parse(input);
    const token = randomBytes(32).toString("hex");
    await tickets().insertOne({
      _id: digest(token),
      ...input,
      expiresAt: new Date(Date.now() + 600000),
    });
    // Fragment is not sent in HTTP requests or referrers. Website posts it only after sign-in and selection.
    return { url: `${config.origin}/clubs#discord=${token}` };
  },
};
