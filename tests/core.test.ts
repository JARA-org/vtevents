import { testEvents } from "./fixtures/events.js";
import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  emptyProfile,
  eventSchema,
  recommendations,
} from "../apps/backend/src/domain.js";
import {
  classify,
  deduplicate,
  normalizeICS,
} from "../apps/backend/src/sources.js";
import { seal, unseal } from "../apps/backend/src/security.js";
import { askGobbler } from "../apps/backend/src/assistant.js";
import { reconcileEvents } from "../apps/backend/src/coordinator.js";
const e = {
  ...testEvents(DateTime.fromISO("2026-09-19T12:00:00Z"))[0],
  start: "2026-09-25T21:00:00Z",
  end: "2026-09-25T22:00:00Z",
};
test("retired personal blocks have no effect on recommendations", () => {
  const legacy = { ...emptyProfile, recurring: [{ kind: "busy", weekday: 5,
    start: "00:00", end: "23:59" }], busy: [{ start: e.start, end: e.end }] };
  const clean = recommendations([e], emptyProfile);
  assert.deepEqual(recommendations([e], legacy), clean);
  assert.equal("fit" in clean[0], false);
  assert.doesNotMatch(clean[0].reason, /schedule|availability|conflict/i);
});
test("deduplication splits keep unique IDs when source records diverge", () => {
  const other = {
    ...e,
    id: "other",
    sources: [
      { ...e.sources[0], source: "vt-sports" as const, sourceId: "different" },
    ],
  };
  const result = reconcileEvents(
    [{ ...other, title: "Different event now" }, e],
    deduplicate([e, other]),
  );
  assert.equal(new Set(result.map((r) => r.id)).size, 2);
});
test("cross-source dedup preserves provenance", () => {
  const other = {
    ...e,
    id: "sports-1",
    sources: [
      { ...e.sources[0], source: "vt-sports" as const, sourceId: "42" },
    ],
  };
  const result = deduplicate([e, other]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sources.length, 2);
  assert.equal(result[0].id, e.id);
});
test("classification matches words, not participant or signature substrings", () => {
  assert.deepEqual(classify("Isidore String Quartet"), ["Arts & music"]);
  assert.deepEqual(
    classify("Participants can bring their signature sandwiches."),
    [],
  );
  assert.deepEqual(classify("Hiking and pottery"), [
    "Arts & music",
    "Outdoors",
  ]);
});
test("schema rejects inverted dates and malformed URLs", () => {
  assert.equal(
    eventSchema.safeParse({ ...e, end: "2020-01-01T00:00:00Z" }).success,
    false,
  );
  assert.equal(
    eventSchema.safeParse({
      ...e,
      sources: [{ ...e.sources[0], url: "javascript:alert(1)" }],
    }).success,
    false,
  );
});
test("source refresh preserves canonical identity when a duplicate source disappears", () => {
  const sports = {
    ...e,
    id: "sports-42",
    sources: [
      { ...e.sources[0], source: "vt-sports" as const, sourceId: "42" },
    ],
  };
  const previous = deduplicate([e, sports]);
  const remaining = reconcileEvents([sports], previous);
  assert.equal(remaining[0].id, e.id);
  assert.equal(remaining[0].sources.length, 1);
  const restored = reconcileEvents([e, sports], remaining);
  assert.equal(restored[0].id, e.id);
  assert.equal(restored[0].sources.length, 2);
});
test("source identity survives a time or title correction", () => {
  const updated = {
    ...e,
    title: "Corrected name",
    start: "2026-09-26T21:00:00Z",
    end: "2026-09-26T22:00:00Z",
  };
  assert.equal(reconcileEvents([updated], [e])[0].id, e.id);
});
test("ICS normalization preserves timezone and cancelled status", () => {
  const raw =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:abc\r\nDTSTART;TZID=America/New_York:20260925T170000\r\nDTEND;TZID=America/New_York:20260925T180000\r\nSUMMARY:Art meetup\r\nSTATUS:CANCELLED\r\nURL:https://gobblerconnect.vt.edu/rsvp?id=123\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const [x] = normalizeICS(
    raw,
    "gobblerconnect",
    "https://gobblerconnect.vt.edu/events",
  );
  assert.equal(x.start, "2026-09-25T21:00:00.000Z");
  assert.equal(x.status, "cancelled");
  assert.equal(x.timezone, "America/New_York");
});
test("recommendations only reference input IDs, exclude cancellations", () => {
  const result = recommendations(
    [e, { ...e, id: "cancelled", status: "cancelled" }],
    emptyProfile,
  );
  assert.deepEqual(
    result.map((r) => r.event.id),
    [e.id],
  );
});
test("assistant fallback grounds Friday after five in stored events", async () => {
  delete process.env.GEMINI_API_KEY;
  const out = await askGobbler(
    "Friday after 5",
    [
      e,
      {
        ...e,
        id: "too-early",
        start: "2026-09-25T18:00:00Z",
        end: "2026-09-25T19:00:00Z",
      },
    ],
    emptyProfile,
    [],
    {},
  );
  assert.equal(out.engine, "deterministic");
  assert.deepEqual(
    out.recommendations.map((x) => x.event.id),
    [e.id],
  );
});
test("token encryption is authenticated and randomizes ciphertext", () => {
  process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  const a = seal({ token: "not-a-real-token" }),
    b = seal({ token: "not-a-real-token" });
  assert.notEqual(a, b);
  assert.equal(unseal(a).token, "not-a-real-token");
  assert.throws(() => unseal(a.slice(0, -5) + "aaaaa"));
});
