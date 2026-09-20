import { DateTime } from "luxon";
import { z } from "zod";
import type {
  CampusEvent,
  DiscoveryRequest,
  DiscoveryView,
  Profile,
  TimelineRequest,
  TimelineView,
  TimelineItem,
} from "../../../packages/shared/src/contracts.js";
import {
  CAMPUS_TZ,
  categories,
  recommendations,
  curateTimelineRecommendations,
} from "./domain.js";
import { HttpError } from "./config.js";

export const discoverySchema = z
  .object({
    searchMode: z.enum(["keyword", "semantic"]).optional(),
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
  };
}

export const timelineSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

/** Pure query projection over the authorized catalog and caller profile/context.
 * Returns seven campus dates, or up to ten upcoming events within an inclusive
 * selection. First selected day has twice the allocation weight; sparse days
 * redistribute spare slots in chronological rounds. No I/O, refresh, models,
 * mutations or transaction. Route enforces session scope. Invalid/reversed/stale
 * ranges fail 400. Safe to retry; input data is never changed. */
export function discoverTimeline(input: TimelineRequest, events: CampusEvent[],
  profile: Profile, saved: string[], feedback: Record<string, number>, now = DateTime.now(),
): TimelineView {
  input = timelineSchema.parse(input);
  const today = now.setZone(CAMPUS_TZ).startOf("day");
  const days = Array.from({ length: 7 }, (_, i) => today.plus({ days: i }).toISODate()!);
  const view: TimelineView = { timezone: CAMPUS_TZ, days, selection: null, items: [], totalMatches: 0 };
  if (input.startDate === undefined && input.endDate === undefined) return view;
  const first = days.indexOf(input.startDate || ""), last = days.indexOf(input.endDate || "");
  if (first < 0 || last < first) throw new HttpError(400, "Choose a start and end day within the current seven-day timeline. Change dates to refresh your week.");
  view.selection = { startDate: days[first], endDate: days[last] };
  const selectedDays = days.slice(first, last + 1);
  const eligible = events.filter(event => {
    const start = DateTime.fromISO(event.start).setZone(CAMPUS_TZ);
    // Date-only/all-day listings remain eligible throughout their supplied day.
    // Do not promote old, multi-month listings into a new day or invent times.
    return selectedDays.includes(start.toISODate() || "") &&
      (event.timeTBD || event.allDay || start.toMillis() >= now.toMillis());
  });
  const ranked = recommendations(eligible, profile, saved, feedback);
  view.totalMatches = ranked.length;
  const groups = selectedDays.map(day => ranked.filter(item => DateTime.fromISO(item.event.start).setZone(CAMPUS_TZ).toISODate() === day));
  const capacity = Math.min(10, ranked.length);
  const weights = selectedDays.map((_, i) => i === 0 ? 2 : 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const quotas = weights.map(w => Math.floor(capacity * w / sum));
  const remainderOrder = weights.map((w, i) => ({ i, fraction: capacity * w / sum - quotas[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let i = 0, spare = capacity - quotas.reduce((a, b) => a + b, 0); i < spare; i++) quotas[remainderOrder[i].i]++;
  const chosen: TimelineItem[] = [];
  const take = (index: number, count: number) => {
    const picks = curateTimelineRecommendations(groups[index], profile, chosen, count);
    chosen.push(...picks);
    const ids = new Set(picks.map(p => p.recommendation.event.id));
    groups[index] = groups[index].filter(p => !ids.has(p.event.id));
  };
  quotas.forEach((count, index) => take(index, count));
  while (chosen.length < capacity && groups.some(group => group.length)) {
    for (let i = 0; i < groups.length && chosen.length < capacity; i++) take(i, 1);
  }
  view.items = chosen.sort((a, b) => Date.parse(a.recommendation.event.start) - Date.parse(b.recommendation.event.start) || a.recommendation.event.id.localeCompare(b.recommendation.event.id));
  return view;
}
