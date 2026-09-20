import { testEvents } from "./fixtures/events.js";
import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { emptyProfile } from "../apps/backend/src/domain.js";
import {
  discoverySchema,
  discoverEvents,
} from "../apps/backend/src/discovery.js";

test("bounded discovery searches the full catalog and never truncates saved events", () => {
  const base = testEvents()[0];
  const events = Array.from({ length: 120 }, (_, i) => ({ ...base, id: `item-${i}`, title: `Activity ${i}` }));
  const saved = [...events.slice(60).map((event) => event.id), "ended"];
  const limited = discoverEvents({ limit: 10 }, events, emptyProfile, saved, {});
  assert.equal(limited.recommendations.length, 10);
  assert.equal(limited.filtered.length, 10);
  assert.equal(limited.totalMatches, 120);
  assert.equal(limited.totalAvailable, 120);
  assert.equal(limited.savedRecommendations.length, 60);
  assert.equal("schedule" in limited, false);
  assert.deepEqual(limited.unavailableSavedIds, ["ended"]);
  const searched = discoverEvents({ limit: 10, search: "Activity 119" }, events, emptyProfile, [], {});
  assert.equal(searched.filtered[0].event.id, "item-119");
  assert.equal(searched.totalMatches, 1);
  assert.equal(discoverEvents({}, events, emptyProfile, [], {}).filtered.length, 120, "legacy callers retain full results");
  for (const limit of [0, 101, 1.5, "60"]) assert.equal(discoverySchema.safeParse({ limit }).success, false);
});

test("backend returns filtered and saved projections without changing inputs", () => {
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
  assert.ok(result.recommendations.every((x) => !("fit" in x)));
  assert.equal(JSON.stringify(events), before);
});
