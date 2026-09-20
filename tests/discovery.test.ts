import { testEvents } from "./fixtures/events.js";
import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { emptyProfile } from "../apps/backend/src/domain.js";
import {
  discoverySchema,
  discoverEvents,
  previewAvailability,
} from "../apps/backend/src/discovery.js";

test("bounded discovery searches the full catalog and never truncates saved schedules", () => {
  const base = testEvents()[0];
  const events = Array.from({ length: 120 }, (_, i) => ({ ...base, id: `item-${i}`, title: `Activity ${i}` }));
  const saved = [...events.slice(60).map((event) => event.id), "ended"];
  const limited = discoverEvents({ limit: 10 }, events, emptyProfile, saved, {});
  assert.equal(limited.recommendations.length, 10);
  assert.equal(limited.filtered.length, 10);
  assert.equal(limited.totalMatches, 120);
  assert.equal(limited.totalAvailable, 120);
  assert.equal(limited.savedRecommendations.length, 60);
  assert.equal(limited.schedule.length, 60);
  assert.deepEqual(limited.unavailableSavedIds, ["ended"]);
  const searched = discoverEvents({ limit: 10, search: "Activity 119" }, events, emptyProfile, [], {});
  assert.equal(searched.filtered[0].event.id, "item-119");
  assert.equal(searched.totalMatches, 1);
  assert.equal(discoverEvents({}, events, emptyProfile, [], {}).filtered.length, 120, "legacy callers retain full results");
  for (const limit of [0, 101, 1.5, "60"]) assert.equal(discoverySchema.safeParse({ limit }).success, false);
});

test("backend returns filtered, saved and chronological projections without changing inputs", () => {
  const now = DateTime.fromISO("2026-09-19T12:00:00Z");
  const events = testEvents(now);
  const before = JSON.stringify(events);
  const saved = [events[2].id, events[0].id];
  const result = discoverEvents(
    { mode: "live", category: "Outdoors", search: "Huckleberry" },
    events,
    emptyProfile,
    saved,
    {},
    now,
  );
  assert.deepEqual(
    result.filtered.map((x) => x.event.id),
    [events[0].id],
  );
  assert.equal(result.savedRecommendations.length, 2);
  assert.ok(result.schedule[0].event.start <= result.schedule[1].event.start);
  assert.ok(result.recommendations.every((x) => x.fit.status === "unknown"));
  assert.equal(JSON.stringify(events), before);
});
test("availability preview normalizes campus time and leaves input unchanged", () => {
  const result = previewAvailability({
    profile: emptyProfile,
    block: { kind: "dated", date: "2026-09-25", start: "17:00", end: "18:00" },
  });
  assert.equal(result.busy[0].start, "2026-09-25T21:00:00.000Z");
  assert.equal(result.busy[0].source, "manual");
  assert.equal(emptyProfile.busy.length, 0);
});
test("availability rejects inverted and ambiguous local times on backend", () => {
  for (const [date, start, end] of [
    ["2026-09-25", "18:00", "17:00"],
    ["2026-03-08", "02:30", "04:00"],
    ["2026-11-01", "01:15", "02:30"],
  ])
    assert.throws(() =>
      previewAvailability({
        profile: emptyProfile,
        block: { kind: "dated", date, start, end },
      }),
    );
  assert.throws(() =>
    previewAvailability({
      profile: emptyProfile,
      block: {
        kind: "recurring",
        weekday: 2,
        start: "18:00",
        end: "17:00",
        availability: "free",
      },
    }),
  );
});
