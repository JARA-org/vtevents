import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import type {
  CampusEvent,
  Category,
} from "../packages/shared/src/contracts.js";
import { emptyProfile, CAMPUS_TZ } from "../apps/backend/src/domain.js";
import {
  discoverTimeline,
  timelineSchema,
} from "../apps/backend/src/discovery.js";
import { testEvents } from "./fixtures/events.js";

const now = DateTime.fromISO("2026-09-20T12:00:00Z");
const base = testEvents(now)[0];
function event(
  day: number,
  i: number,
  categories: Category[] = ["Outdoors"],
): CampusEvent {
  const start = now
    .setZone(CAMPUS_TZ)
    .startOf("day")
    .plus({ days: day, hours: 10, minutes: i });
  return {
    ...base,
    id: `${day}-${i}`,
    title: `Event ${day}-${i}`,
    categories,
    organizer: `Organizer ${i}`,
    start: start.toUTC().toISO()!,
    end: start.plus({ hours: 1 }).toUTC().toISO()!,
  };
}
const query = { startDate: "2026-09-20", endDate: "2026-09-23" };

test("timeline supplies exactly seven campus days across DST and validates all range endpoints", () => {
  const dst = DateTime.fromISO("2026-03-08T04:30:00Z");
  const view = discoverTimeline({}, [], emptyProfile, [], {}, dst);
  assert.equal(view.timezone, CAMPUS_TZ);
  assert.equal(view.days.length, 7);
  assert.equal(view.days[0], "2026-03-07");
  assert.equal(view.days[6], "2026-03-13");
  assert.equal(view.selection, null);
  assert.deepEqual(view.items, []);
  for (const input of [
    { startDate: "2026-09-21" },
    { endDate: "2026-09-21" },
    { startDate: "2026-09-19", endDate: "2026-09-22" },
    { startDate: "2026-09-25", endDate: "2026-09-27" },
    { startDate: "2026-09-25", endDate: "2026-09-21" },
    { startDate: "2026-02-30", endDate: "2026-09-21" },
  ])
    assert.throws(() => discoverTimeline(input, [], emptyProfile, [], {}, now));
  assert.equal(
    timelineSchema.safeParse({ ...query, userId: "someone-else" }).success,
    false,
  );
  assert.equal(
    timelineSchema.safeParse({ ...query, interests: ["Sports"] }).success,
    false,
  );
});

test("ten slots favor the beginning 4/2/2/2 and remain chronological without mutating catalog", () => {
  const events = Array.from({ length: 4 }, (_, d) =>
    Array.from({ length: 8 }, (_, i) => event(d, i)),
  )
    .flat()
    .reverse();
  const before = JSON.stringify(events);
  const view = discoverTimeline(query, events, emptyProfile, [], {}, now);
  assert.equal(view.items.length, 10);
  assert.equal(view.totalMatches, 32);
  assert.deepEqual(
    [0, 1, 2, 3].map(
      (d) =>
        view.items.filter((x) => x.recommendation.event.id.startsWith(`${d}-`))
          .length,
    ),
    [4, 2, 2, 2],
  );
  assert.equal(
    new Set(view.items.map((x) => x.recommendation.event.id)).size,
    10,
  );
  const times = view.items.map((x) => Date.parse(x.recommendation.event.start));
  assert.deepEqual(
    times,
    [...times].sort((a, b) => a - b),
  );
  assert.equal(JSON.stringify(events), before);
});

test("arbitrary inclusive ranges and sparse days redistribute within the selection only", () => {
  const events = [
    event(0, 0),
    event(1, 0),
    ...Array.from({ length: 15 }, (_, i) => event(3, i)),
    event(5, 0),
  ];
  const view = discoverTimeline(
    { startDate: "2026-09-21", endDate: "2026-09-23" },
    events,
    emptyProfile,
    [],
    {},
    now,
  );
  assert.equal(view.items.length, 10);
  assert.ok(view.items.every((x) => /^(1|3)-/.test(x.recommendation.event.id)));
  assert.equal(view.items[0].recommendation.event.id, "1-0");
  const oneDay = discoverTimeline(
    { startDate: "2026-09-23", endDate: "2026-09-23" },
    events,
    emptyProfile,
    [],
    {},
    now,
  );
  assert.equal(oneDay.items.length, 10);
  assert.ok(
    oneDay.items.every((x) => x.recommendation.event.id.startsWith("3-")),
  );
});

test("explicit interests outrank unrelated events even with a schedule conflict", () => {
  const events = Array.from({ length: 15 }, (_, i) =>
    event(1, i, i === 14 ? ["Outdoors", "Arts & music"] : ["Sports"]),
  );
  const p = {
    ...emptyProfile,
    interests: ["Outdoors", "Arts & music"] as Category[],
    busy: [
      {
        id: "busy",
        start: events[14].start,
        end: events[14].end!,
        source: "manual" as const,
      },
    ],
  };
  const view = discoverTimeline(query, events, p, [], {}, now);
  const match = view.items.find((x) => x.recommendation.event.id === "1-14");
  assert.ok(match);
  assert.deepEqual(match.matchedInterests, ["Outdoors", "Arts & music"]);
  assert.equal(match.recommendation.fit.status, "conflict");
});

test("no-interest selection includes a diverse set, including academic/career options", () => {
  const events = Array.from({ length: 20 }, (_, i) => ({
    ...event(1, i, ["Sports"]),
    organizer: "One organizer",
  }));
  for (const [i, c] of (
    [
      "Arts & music",
      "Tech & science",
      "Career",
      "Community",
      "Food & fun",
      "Outdoors",
    ] as Category[]
  ).entries())
    events.push(event(1, 30 + i, [c]));
  const view = discoverTimeline(query, events, emptyProfile, [], {}, now);
  const categories = new Set(
    view.items.flatMap((x) => x.recommendation.event.categories),
  );
  assert.equal(categories.size, 7);
  assert.ok(view.items.every((x) => x.matchedInterests.length === 0));
});

test("past, cancelled and out-of-range events are excluded; unknown times stay honest", () => {
  const early = { ...event(0, 0), id: "early", start: "2026-09-20T10:00:00Z" };
  const cancelled = {
    ...event(0, 1),
    id: "cancelled",
    status: "cancelled" as const,
  };
  const tbd = { ...early, id: "tbd", timeTBD: true, end: null };
  const allDay = { ...early, id: "all-day", allDay: true };
  const events = [early, cancelled, tbd, allDay, event(6, 0)];
  const view = discoverTimeline(query, events, emptyProfile, [], {}, now);
  assert.deepEqual(
    new Set(view.items.map((x) => x.recommendation.event.id)),
    new Set(["tbd", "all-day"]),
  );
  assert.equal(
    view.items.find((x) => x.recommendation.event.id === "tbd")!.recommendation
      .event.timeTBD,
    true,
  );
  assert.deepEqual(
    discoverTimeline(query, [], emptyProfile, [], {}, now).items,
    [],
  );
});
