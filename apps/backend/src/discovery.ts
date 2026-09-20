import { DateTime } from "luxon";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AvailabilityInput,
  CampusEvent,
  DiscoveryRequest,
  DiscoveryView,
  Profile,
} from "../../../packages/shared/src/contracts.js";
import {
  CAMPUS_TZ,
  categories,
  profileSchema,
  recommendations,
} from "./domain.js";
import { HttpError } from "./config.js";

export const discoverySchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    mode: z.literal("live").optional(),
    search: z.string().max(300).optional(),
    category: z
      .union([z.enum(categories), z.literal("All interests")])
      .optional(),
    dateFilter: z.enum(["Any day", "Today", "This week", "Weekend"]).optional(),
  })
  .strict();

/** Pure read projection. Session resolution is owned by the HTTP adapter. */
export function discoverEvents(
  input: DiscoveryRequest,
  events: CampusEvent[],
  profile: Profile,
  saved: string[],
  feedback: Record<string, number>,
  now = DateTime.now(),
): DiscoveryView {
  const ranked = recommendations(events, profile, saved, feedback);
  const today = now.setZone(CAMPUS_TZ);
  const filtered = ranked.filter(({ event }) => {
    const start = DateTime.fromISO(event.start).setZone(CAMPUS_TZ);
    return (
      (!input.search ||
        (event.title + " " + event.description + " " + event.location)
          .toLowerCase()
          .includes(input.search.toLowerCase())) &&
      (!input.category ||
        input.category === "All interests" ||
        event.categories.includes(input.category)) &&
      (!input.dateFilter ||
        input.dateFilter === "Any day" ||
        (input.dateFilter === "Today" && start.hasSame(today, "day")) ||
        (input.dateFilter === "This week" &&
          start <= today.plus({ days: 7 })) ||
        (input.dateFilter === "Weekend" && start.weekday >= 6))
    );
  });
  const savedRecommendations = ranked.filter(({ event }) =>
    saved.includes(event.id),
  );
  return {
    totalAvailable: events.length,
    totalMatches: filtered.length,
    unavailableSavedIds: saved.filter(
      (id) => !events.some((event) => event.id === id),
    ),
    sportsTicker:
      input.category === "Sports"
        ? events
            .filter(
              (e) =>
                e.sports &&
                e.status !== "cancelled" &&
                (e.sports.state === "live" ||
                  DateTime.fromISO(e.start) >= today.startOf("day")),
            )
            .sort(
              (a, b) =>
                Number(b.sports?.state === "live") -
                  Number(a.sports?.state === "live") ||
                a.start.localeCompare(b.start),
            )
            .slice(0, 8)
        : [],
    recommendations:
      input.limit === undefined ? ranked : ranked.slice(0, input.limit),
    filtered:
      input.limit === undefined ? filtered : filtered.slice(0, input.limit),
    savedRecommendations,
    schedule: [...savedRecommendations].sort((a, b) =>
      a.event.start.localeCompare(b.event.start),
    ),
  };
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const availabilitySchema = z.object({
  profile: profileSchema,
  block: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("recurring"),
      weekday: z.number().int().min(1).max(7),
      start: time,
      end: time,
      availability: z.enum(["free", "busy"]),
    }),
    z.object({
      kind: z.literal("dated"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      start: time,
      end: time,
    }),
  ]),
});

/** Validate a draft; no database or provider effects. */
export function previewAvailability(input: AvailabilityInput): Profile {
  const { profile, block } = availabilitySchema.parse(input);
  if (block.kind === "recurring")
    return profileSchema.parse({
      ...profile,
      recurring: [
        ...profile.recurring,
        {
          id: randomUUID(),
          weekday: block.weekday,
          start: block.start,
          end: block.end,
          kind: block.availability,
        },
      ],
    });
  const start = DateTime.fromISO(`${block.date}T${block.start}`, {
    zone: CAMPUS_TZ,
  });
  const end = DateTime.fromISO(`${block.date}T${block.end}`, {
    zone: CAMPUS_TZ,
  });
  if (
    !start.isValid ||
    !end.isValid ||
    end <= start ||
    start.toFormat("HH:mm") !== block.start ||
    end.toFormat("HH:mm") !== block.end ||
    start.getPossibleOffsets().length > 1 ||
    end.getPossibleOffsets().length > 1
  )
    throw new HttpError(
      400,
      "Enter an unambiguous date and time range with the end after the start.",
    );
  return profileSchema.parse({
    ...profile,
    busy: [
      ...profile.busy,
      {
        id: randomUUID(),
        start: start.toUTC().toISO(),
        end: end.toUTC().toISO(),
        source: "manual",
      },
    ],
  });
}
