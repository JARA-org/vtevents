import test from "node:test";
import assert from "node:assert/strict";
import type { CampusEvent } from "../packages/shared/src/contracts.js";
import { consolidateEvents } from "../apps/backend/src/event-consolidation.js";

function event(id: string, patch: Partial<CampusEvent> = {}): CampusEvent {
  return {
    id,
    title: "Campus performance",
    description: "Music",
    start: "2026-09-25T21:00:00Z",
    end: null,
    timezone: "America/New_York",
    location: "Moss Arts Center, Blacksburg",
    organizer: null,
    categories: ["Arts & music"],
    sources: [
      {
        source: "vt-events",
        sourceId: id,
        url: `https://calendar.vt.edu/events/${id}`,
        fetchedAt: "2026-09-19T12:00:00Z",
      },
    ],
    updatedAt: "2026-09-19T12:00:00Z",
    status: "scheduled",
    mode: "live",
    timeTBD: false,
    allDay: false,
    endEstimated: false,
    ...patch,
  };
}
test("consolidation combines complementary metadata and provenance without changing input", () => {
  const a = event("a"),
    b = event("b", {
      onlineUrl: "https://video.vt.edu/watch/1",
      isOnline: true,
      media: [{ kind: "image", url: "https://vt.edu/flyer.jpg" }],
      links: [
        { kind: "tickets", label: "Tickets", url: "https://vt.edu/tickets/1" },
      ],
    });
  const before = structuredClone([a, b]);
  const [result] = consolidateEvents([a, b]);
  assert.equal(result.id, "a");
  assert.equal(result.sources.length, 2);
  assert.equal(result.onlineUrl, b.onlineUrl);
  assert.equal(result.media?.length, 1);
  assert.equal(result.links?.length, 1);
  assert.deepEqual([a, b], before);
});
test("title alone, separate occurrences, different venue, clubs and visibility never merge", () => {
  const a = event("a");
  for (const patch of [
    { location: null },
    { location: "Alexandria campus" },
    { start: "2026-09-26T21:00:00Z" },
    { timeTBD: true },
    { visibility: { kind: "user" as const, userId: "u" } },
  ])
    assert.equal(consolidateEvents([a, event("b", patch)]).length, 2);
  assert.equal(
    consolidateEvents([
      event("a", { clubId: "a" }),
      event("b", { clubId: "b" }),
    ]).length,
    2,
  );
});
test("shared occurrence URL permits conflict reporting; source fetch recency never silently overwrites facts", () => {
  const a = event("a"),
    b = event("b", {
      location: "Changed venue",
      updatedAt: "2026-09-20T12:00:00Z",
      links: [{ kind: "source", label: "Original", url: a.sources[0].url }],
    });
  const [result] = consolidateEvents([a, b]);
  assert.equal(result.location, a.location);
  const conflict = result.conflicts?.find((c) => c.field === "location");
  assert.equal(conflict?.resolution, "unresolved");
  assert.equal(conflict?.alternatives.length, 2);
});
test("native revisions retain stable IDs and do not resurrect withdrawn metadata", () => {
  const a = event("a"),
    b = event("b");
  const [prior] = consolidateEvents([a, b]);
  const [remaining] = consolidateEvents(
    [{ ...b, title: "New title", location: null }],
    [prior],
  );
  assert.equal(remaining.id, "a");
  assert.equal(remaining.location, null);
  assert.equal(remaining.sources.length, 1);
  const newer = {
    ...a,
    title: "Corrected title",
    updatedAt: "2026-09-20T00:00:00Z",
  };
  assert.equal(consolidateEvents([a, newer])[0].title, newer.title);
});
test("source split produces separate unique canonical IDs", () => {
  const a = event("a"),
    b = event("b");
  const previous = consolidateEvents([a, b]);
  const next = consolidateEvents(
    [{ ...b, title: "Different activity" }, a],
    previous,
  );
  assert.equal(next.length, 2);
  assert.equal(new Set(next.map((e) => e.id)).size, 2);
});
test("owner corrected Discord values and identity survive a matching source including intentional removal", () => {
  const a = event("a");
  const d = event("discord-d", {
    ownerCorrected: true,
    location: null,
    description: "Owner's description",
    sources: [
      {
        source: "discord",
        sourceId: "d",
        url: "https://discord.com/channels/g/c/m",
        fetchedAt: a.updatedAt,
      },
    ],
    links: [{ kind: "source", label: "Original", url: a.sources[0].url }],
  });
  const [result] = consolidateEvents([a, d]);
  assert.equal(result.id, d.id);
  assert.equal(result.location, null);
  assert.equal(result.description, d.description);
  assert.ok(result.aliases?.includes(a.id));
  assert.equal(
    result.conflicts?.find((c) => c.field === "description")?.resolution,
    "reviewed",
  );
});
test("shared collection/feed URLs cannot merge different activities", () => {
  for (const url of [
    "https://calendar.vt.edu/events",
    "https://calendar.vt.edu/calendar/feed.ics",
  ]) {
    const a = event("a", {
        sources: [
          {
            source: "vt-events",
            sourceId: "a",
            url,
            fetchedAt: "2026-09-19T12:00:00Z",
          },
        ],
      }),
      b = event("b", {
        title: "Other activity",
        sources: [{ ...a.sources[0], sourceId: "b" }],
      });
    assert.equal(consolidateEvents([a, b]).length, 2);
  }
});
