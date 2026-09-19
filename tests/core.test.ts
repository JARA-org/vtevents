import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import {
  demoEvents,
  emptyProfile,
  scheduleFit,
  eventICS,
  eventSchema,
  recommendations,
} from "../packages/shared/src/index.js";
import {
  classify,
  deduplicate,
  normalizeICS,
} from "../apps/backend/src/sources.js";
import { seal, unseal } from "../apps/backend/src/security.js";
import { writeKey } from "../apps/backend/src/integrations.js";
import { askGobbler } from "../apps/backend/src/assistant.js";
import { reconcileEvents } from "../apps/backend/src/coordinator.js";
const e = {
  ...demoEvents(DateTime.fromISO("2026-09-19T12:00:00Z"))[0],
  start: "2026-09-25T21:00:00Z",
  end: "2026-09-25T22:00:00Z",
};
test("unknown availability never claims free time", () =>
  assert.equal(scheduleFit(e, emptyProfile).status, "unknown"));
test("recurring availability uses campus timezone", () =>
  assert.equal(
    scheduleFit(e, {
      ...emptyProfile,
      recurring: [
        { id: "1", weekday: 5, start: "17:00", end: "18:00", kind: "free" },
      ],
    }).status,
    "free",
  ));
test("busy blocks take precedence over free blocks", () =>
  assert.equal(
    scheduleFit(e, {
      ...emptyProfile,
      recurring: [
        { id: "1", weekday: 5, start: "17:00", end: "18:00", kind: "free" },
      ],
      busy: [
        {
          id: "2",
          start: "2026-09-25T21:30:00Z",
          end: "2026-09-25T22:30:00Z",
          source: "manual",
        },
      ],
    }).status,
    "conflict",
  ));
test("touching endpoints do not conflict", () =>
  assert.equal(
    scheduleFit(e, {
      ...emptyProfile,
      busy: [
        {
          id: "2",
          start: e.end!,
          end: "2026-09-25T23:00:00Z",
          source: "manual",
        },
      ],
    }).status,
    "unknown",
  ));
test("DST changes preserve local recurring hours", () => {
  const winter = {
    ...e,
    start: "2026-11-06T22:00:00Z",
    end: "2026-11-06T23:00:00Z",
  };
  assert.equal(
    scheduleFit(winter, {
      ...emptyProfile,
      recurring: [
        { id: "1", weekday: 5, start: "17:00", end: "18:00", kind: "free" },
      ],
    }).status,
    "free",
  );
});
test("partial availability and missing event end remain unknown", () => {
  assert.equal(
    scheduleFit(e, {
      ...emptyProfile,
      recurring: [
        { id: "1", weekday: 5, start: "17:30", end: "19:00", kind: "free" },
      ],
    }).status,
    "unknown",
  );
  assert.equal(
    scheduleFit({ ...e, end: null }, emptyProfile).status,
    "unknown",
  );
});
test("nonexistent and repeated DST boundary times remain unknown", () => {
  for (const [start, end, freeStart, freeEnd] of [
    ["2026-03-08T07:30:00Z", "2026-03-08T08:00:00Z", "02:00", "04:00"],
    ["2026-11-01T06:15:00Z", "2026-11-01T06:45:00Z", "01:00", "02:00"],
  ]) {
    const fit = scheduleFit(
      { ...e, start, end },
      {
        ...emptyProfile,
        recurring: [
          {
            id: "dst",
            weekday: 7,
            start: freeStart,
            end: freeEnd,
            kind: "free",
          },
        ],
      },
    );
    assert.equal(fit.status, "unknown");
    assert.match(fit.reason, /daylight-saving/);
  }
});
test("all-day ICS preserves exclusive end date across multiple days", () => {
  const text = eventICS({
    ...e,
    allDay: true,
    start: "2026-09-25T04:00:00Z",
    end: "2026-09-28T04:00:00Z",
  });
  assert.match(text, /DTSTART;VALUE=DATE:20260925/);
  assert.match(text, /DTEND;VALUE=DATE:20260928/);
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
test("ICS export escapes content and has stable UID", () => {
  const s = eventICS({ ...e, title: "Hello, Hokies;\nBEGIN:VEVENT" });
  assert.match(s, /SUMMARY:Hello\\, Hokies\\;\\nBEGIN:VEVENT/);
  assert.equal((s.match(/\r\nBEGIN:VEVENT\r\n/g) || []).length, 1);
  assert.match(s, new RegExp(`UID:${e.id}@my-little-gobbler`));
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
test("calendar key is stable, scoped to user and destination", () => {
  assert.equal(writeKey("u", "e", "google"), writeKey("u", "e", "google"));
  assert.notEqual(writeKey("u", "e", "google"), writeKey("v", "e", "google"));
  assert.notEqual(writeKey("u", "e", "google"), writeKey("u", "e", "canvas"));
});
