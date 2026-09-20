import assert from "node:assert/strict";
import test from "node:test";
import {
  discoverSportsSchedules,
  parseHokieSports,
} from "../apps/backend/src/sports-source.js";

const url = "https://hokiesports.com/sports/football/schedule";
const now = new Date("2026-09-19T12:00:00Z");
const metadata = {
  "@type": "Event",
  "@id": `${url}#/schema/event/1`,
  name: "Virginia Tech vs. VMI",
  description: "<b>Opening game</b>",
  startDate: "2026-09-05T23:30:00Z",
  eventSchedule: {
    startDate: "2026-09-05",
    startTime: "19:30:00",
    scheduleTimezone: "America/New_York",
  },
};
// Reduced fixture follows WMT's public SSR markup observed September 19, 2026.
const row = `<div class="schedule-event-block"><div class="schedule-event-date"><time>Sat</time><time>Sep 5</time></div><strong class="schedule-default-team__opponent-name">VMI</strong><span class="schedule-default-team__venue">Lane Stadium/Worsham Field</span><span class="schedule-event-block__location-venue">home</span><div class="schedule-event-item-result__label">W 73-3</div><div entity-name="schedule-events" entity-id="22958"></div><img class="schedule-default-team__image" src="data:image/gif;base64,AAA" data-src="/vmi.png" alt="VMI"><a href="/boxscore/22958">Box Score</a><a href="https://www.espn.com/watch/22958">Watch</a><a href="https://tickets.example/game">Tickets</a><a href="javascript:alert(1)">Bad link</a></div>`;
const page = (data: unknown, body = row) =>
  `<h1>Football 2026 Schedule</h1><script type="application/ld+json">${JSON.stringify(data)}</script>${body}`;

test("HokieSports enriches structured events with stable provider IDs, venue, scores, links and images", () => {
  const [event] = parseHokieSports(page(metadata), url, now);
  assert.equal(event.sources[0].sourceId, "22958");
  assert.equal(event.location, "Lane Stadium/Worsham Field");
  assert.equal(event.sports?.sport, "Football");
  assert.equal(event.title, "Football: Virginia Tech vs. VMI");
  assert.equal(event.sports?.homeScore, "73");
  assert.equal(event.sports?.awayScore, "3");
  assert.equal(event.sports?.state, "final");
  assert.equal(event.end, null);
  assert.equal(event.endEstimated, false);
  assert.equal(event.media?.[0].url, "https://hokiesports.com/vmi.png");
  assert.deepEqual(
    event.links?.map((x) => x.kind),
    ["source", "stats", "stream", "tickets"],
  );
  assert.equal(event.sources[0].sourceUpdatedAt, null);
});

test("sport titles preserve identity, include specific sport names, and avoid duplicate labels", () => {
  const original = parseHokieSports(page(metadata), url, now)[0];
  const soccer = parseHokieSports(page({ ...metadata, sport: "Women's Soccer" }), url, now)[0];
  assert.equal(soccer.title, "Women's Soccer: Virginia Tech vs. VMI");
  assert.equal(soccer.id, original.id);
  assert.equal(soccer.sources[0].sourceId, original.sources[0].sourceId);
  assert.equal(soccer.sports?.opponent, "VMI");
  const labeled = parseHokieSports(page({ ...metadata, name: "Virginia Tech Football vs. VMI" }), url, now)[0];
  assert.equal(labeled.title, "Virginia Tech Football vs. VMI");
  const seasonal = parseHokieSports(page(metadata).replace("Football 2026 Schedule", "2026 Football Schedule"), url, now)[0];
  assert.equal(seasonal.title, original.title);
});

test("HokieSports date-only markers override placeholder noon and never invent an end", () => {
  const event = parseHokieSports(
    page(
      {
        ...metadata,
        startDate: "2026-10-10T16:00:00Z",
        eventSchedule: { startDate: "2026-10-10", startTime: "00:00:00" },
      },
      "",
    ),
    url,
    now,
  )[0];
  assert.equal(event.timeTBD, true);
  assert.equal(event.start, "2026-10-10T04:00:00.000Z");
  assert.equal(event.timeDetails?.confirmedStart, null);
  assert.equal(event.end, null);
});

test("HokieSports matching requires date as well as opponent and collapses duplicated schema representations", () => {
  const duplicate = {
    ...metadata,
    "@type": "SportsEvent",
    "@id": `${url}#/schema/sports-event`,
    sport: "Football",
  };
  const events = parseHokieSports(
    page({
      "@graph": [
        metadata,
        duplicate,
        {
          ...metadata,
          "@id": "game2",
          startDate: "2026-09-12T23:30:00Z",
          eventSchedule: { startDate: "2026-09-12", startTime: "19:30:00" },
        },
      ],
    }),
    url,
    now,
  );
  assert.equal(events.length, 2);
  assert.equal(events[1].sports?.venueType, "unknown");
  assert.equal(events[1].sources[0].sourceId, "game2");
});

test("schedule discovery excludes external/archive/unsafe links and malformed metadata fails closed", () => {
  assert.deepEqual(
    discoverSportsSchedules(
      `<a href="/sports/football/schedule">A</a><a href="${url}/?x=1">B</a><a href="https://evil.test/sports/golf/schedule">C</a><a href="/sports/football/schedule/2020">D</a>`,
      url,
    ),
    [url],
  );
  assert.deepEqual(
    parseHokieSports(
      '<script type="application/ld+json">not json</script>',
      url,
      now,
    ),
    [],
  );
  assert.deepEqual(
    parseHokieSports(page({ ...metadata, startDate: "not a date" }), url, now),
    [],
  );
});

