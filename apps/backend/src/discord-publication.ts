import { createHash, randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import type {
  ClubEventValues,
  DiscordPublicationService,
  DiscordCollectedMessage,
  DiscordEventCandidate,
} from "../../../packages/shared/src/contracts.js";
import { database, db, mongoClient } from "./store.js";
import { HttpError } from "./config.js";
import { CAMPUS_TZ, eventSchema, categories } from "./domain.js";
import {
  validateDiscordCandidate,
  explicitDiscordDate,
} from "./discord-event-rules.js";
import { discordBotRepository } from "./discord-bot-store.js";
import { discordAnnouncements } from "./discord-announcements.js";
import { agentHandoffPolicy } from "./agent-policy.js";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const eventId = (key: string) => "discord-" + hash(key).slice(0, 32);
const valuesSchema = z
  .object({
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => explicitDiscordDate(v) === v)
      .nullable()
      .optional(),
    startTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    endTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional(),
    categories: z.array(z.enum(categories)).min(1).max(7).optional(),
    title: z.string().trim().min(1).max(300),
    description: z.string().max(12000),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => explicitDiscordDate(v) === v),
    location: z.string().trim().min(1).max(2000).nullable(),
    onlineUrl: z
      .string()
      .url()
      .refine(
        (v) =>
          /^https?:\/\//i.test(v) &&
          !new URL(v).username &&
          !new URL(v).password,
      )
      .nullable(),
    isOnline: z.boolean(),
  })
  .strict()
  .refine(
    (v) => !!v.location || v.isOnline || !!v.onlineUrl,
    "Supply a physical or online location.",
  );
type Row = DiscordCollectedMessage & {
  key: string;
  fingerprint: string;
  candidate: DiscordEventCandidate;
  status: string;
};
type Override = {
  _id: string;
  revision: string;
  values: ClubEventValues;
  updatedAt: string;
};
const corrections = () =>
  database().collection<Override>("discord_event_corrections");
export const discordPublication: DiscordPublicationService = {
  async list(input) {
    agentHandoffPolicy.authorize({
      sender: "discord",
      recipient: "coordinator",
      kind: "public_events",
      visibility: "public",
    });
    if (!db) return [];
    const result: Awaited<ReturnType<DiscordPublicationService["list"]>> = [];
    const rows = database()
      .collection<Row>("discord_collected_messages")
      .find({ status: "qualified" });
    for await (const row of rows) {
      if (!(await discordAnnouncements.current(row))) continue;
      if (!(await discordBotRepository.eligible(row))) continue;
      const candidate = validateDiscordCandidate(
        row.candidate,
        row.text + (row.imageTexts || []).map((t) => "\n" + t.text).join(""),
        {
          postedAt: row.createdAt,
          timezone: CAMPUS_TZ,
          messages: row.parts?.map((p) => ({
            ...p,
            text:
              p.text +
              (row.imageTexts || [])
                .filter((t) => t.messageId === p.messageId)
                .map((t) => "\n" + t.text)
                .join(""),
          })),
        },
      );
      if (!candidate) continue;
      const club = await database()
        .collection<{ _id: string; name: string; discordGuildId: string }>(
          "managed_clubs",
        )
        .findOne({ discordGuildId: row.guildId });
      if (!club) continue;
      const id = eventId(row.key),
        override = await corrections().findOne({ _id: id });
      const values: ClubEventValues = {
        title: candidate.title,
        description: candidate.description,
        date: candidate.date,
        location: candidate.location,
        onlineUrl: candidate.onlineUrl,
        isOnline: candidate.isOnline,
        startTime: candidate.startTime || null,
        endTime: candidate.endTime || null,
        endDate: null,
        categories: ["Community"],
        ...override?.values,
      };
      const day = DateTime.fromISO(values.date, { zone: CAMPUS_TZ }).startOf(
        "day",
      );
      const start = values.startTime
        ? DateTime.fromISO(`${values.date}T${values.startTime}`, {
            zone: CAMPUS_TZ,
          })
        : day;
      const end = values.endTime
        ? DateTime.fromISO(
            `${values.endDate || values.date}T${values.endTime}`,
            { zone: CAMPUS_TZ },
          )
        : null;
      if (
        !input?.includePast &&
        (end || day).plus({ days: 1 }).toMillis() <= Date.now()
      )
        continue;
      const revision = hash(
        row.fingerprint + ":" + (override?.revision || "source"),
      );
      const updatedAt = override?.updatedAt || row.editedAt || row.createdAt;
      const event = {
        ...eventSchema.parse({
          id,
          title: values.title,
          description: values.description,
          start: start.toUTC().toISO(),
          end: end?.toUTC().toISO() || null,
          timezone: CAMPUS_TZ,
          location: values.location,
          onlineUrl: values.onlineUrl,
          isOnline: values.isOnline,
          organizer: club.name,
          categories: values.categories,
          sources: [
            {
              source: "discord",
              sourceId: row.key,
              url: row.sourceUrl,
              fetchedAt: row.editedAt || row.createdAt,
            },
          ],
          updatedAt,
          status: "scheduled",
          mode: "live",
          timeTBD: !values.startTime,
          allDay: false,
          endEstimated: false,
        }),
        clubId: club._id,
        ownerCorrected: !!override,
        revision,
        timeDetails: {
          precision: values.startTime
            ? values.endTime
              ? ("confirmed" as const)
              : ("start_only" as const)
            : ("date_only" as const),
          startDate: values.date,
          ...(values.endDate ? { endDate: values.endDate } : {}),
          confirmedStart: values.startTime ? start.toUTC().toISO() : null,
          confirmedEnd: end?.toUTC().toISO() || null,
        },
      };
      result.push({ event, edit: { eventId: id, revision, values } });
    }
    return result;
  },
  async edit(userId, input) {
    const parsed = z
      .object({
        eventId: z.string().regex(/^discord-[a-f0-9]{32}$/),
        revision: z.string().regex(/^[a-f0-9]{64}$/),
        values: valuesSchema,
      })
      .strict()
      .parse(input);
    const published = (
      await discordPublication.list({ includePast: true })
    ).find((row) => row.event.id === parsed.eventId);
    if (!published)
      throw new HttpError(404, "This event is no longer published.");
    const nextValues = { ...published.edit.values, ...parsed.values };
    if (nextValues.endDate && !nextValues.endTime)
      throw new HttpError(400, "Supply an end time with the end date.");
    if (
      nextValues.endTime &&
      (!nextValues.startTime ||
        `${nextValues.endDate || nextValues.date}T${nextValues.endTime}` <=
          `${nextValues.date}T${nextValues.startTime}`)
    )
      throw new HttpError(
        400,
        "End date and time must follow the start date and time.",
      );
    for (const [date, time] of [
      [nextValues.date, nextValues.startTime],
      [nextValues.endDate || nextValues.date, nextValues.endTime],
    ]) {
      if (!time) continue;
      const clock = DateTime.fromISO(`${date}T${time}`, { zone: CAMPUS_TZ });
      if (
        !clock.isValid ||
        clock.toFormat("HH:mm") !== time ||
        clock.getPossibleOffsets().length !== 1
      )
        throw new HttpError(
          400,
          "Choose an unambiguous local time in America/New_York.",
        );
    }
    if (!mongoClient) throw new HttpError(503, "Storage unavailable.");
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        const club = await database()
          .collection("managed_clubs")
          .findOne(
            { _id: published.event.clubId as never, ownerId: userId },
            { session },
          );
        if (!club)
          throw new HttpError(403, "You do not manage this event's club.");
        const source = await database()
          .collection<Row>("discord_collected_messages")
          .findOne(
            { key: published.event.sources[0].sourceId, status: "qualified" },
            { session },
          );
        if (!source)
          throw new HttpError(
            409,
            "The source changed. Refresh before editing.",
          );
        await database()
          .collection("discord_collection_fences")
          .updateOne(
            { key: `${source.guildId}:${source.channelId}` },
            { $inc: { revision: 1 } },
            { session, upsert: true },
          );
        const old = await corrections().findOne(
          { _id: parsed.eventId },
          { session },
        );
        if (
          hash(source.fingerprint + ":" + (old?.revision || "source")) !==
          parsed.revision
        )
          throw new HttpError(
            409,
            "This event changed. Refresh before saving your correction.",
          );
        const updatedAt = new Date().toISOString();
        await corrections().updateOne(
          { _id: parsed.eventId },
          {
            $set: { values: nextValues, revision: randomUUID(), updatedAt },
          },
          { upsert: true, session },
        );
        await database().collection("club_event_audit").insertOne(
          {
            eventId: parsed.eventId,
            clubId: published.event.clubId,
            userId,
            before: published.edit.values,
            after: nextValues,
            updatedAt,
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    const updated = (await discordPublication.list({ includePast: true })).find(
      (row) => row.event.id === parsed.eventId,
    );
    if (!updated)
      throw new HttpError(409, "This event was withdrawn. Refresh the page.");
    return updated.event;
  },
};
