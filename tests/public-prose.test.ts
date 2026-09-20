import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicProse } from "../apps/backend/src/public-prose.js";
import type { PublicSourceDefinition } from "../packages/shared/src/contracts.js";
const source: PublicSourceDefinition = {
  id: "test",
  label: "Official VT source",
  source: "vt-events",
  kind: "mixed",
  seeds: [],
  allowedHosts: [],
  intervalMs: 1000,
  maxPages: 2,
};
const now = new Date("2026-09-19T00:00:00Z");
test("arts ignores publication date and keeps supplied admission and image without guessing duration", () => {
  const html = `<meta property="og:image" content="/quartet.jpg"><main><h1>String Quartet</h1><p>June 10, 2021</p><div class="vt-text"><p>Friday, September 25, 2026, 7:30 PM</p><p>Fife Theatre</p><p>Approximately 95 minutes</p><p>Category A $60 | Students $10</p></div></main>`;
  const [e] = parsePublicProse(
    html,
    "https://artscenter.vt.edu/performances/quartet.html",
    source,
    now,
  ).events;
  assert.equal(e.start, "2026-09-25T23:30:00.000Z");
  assert.equal(e.end, null);
  assert.equal(e.admission?.currency, "USD");
  assert.equal(e.media?.[0].url, "https://artscenter.vt.edu/quartet.jpg");
});
test("Cranwell uses term year, keeps hybrid location, rejects tentative, ranges and holidays", () => {
  const html = `<main><h2>Fall 2026 Cranwell Events</h2><ul><li>10 September, 5:00 PM, GLC Room F and Zoom webinar | H1-B Workshop</li><li>4 September, 3:00-5:00 PM, Harper Hall | Coffee</li><li>10-19 September, YMCA | Festival</li><li>7 September, all day, University Offices Closed | Labor Day (No Classes)</li></ul><h2>Spring 2027 Cranwell Events</h2><li>5 February (tentative), 3:00 PM, Harper Hall | Tentative coffee</li><li>1 March, TBD | Missing venue</li></main>`;
  const events = parsePublicProse(
    html,
    "https://international.vt.edu/calendar.html",
    source,
    now,
  ).events;
  assert.equal(events.length, 2);
  assert.equal(events[0].isOnline, true);
  assert.equal(events[0].location, "GLC Room F");
  assert.equal(events[1].end, "2026-09-04T21:00:00.000Z");
});
test("research online-only program gets year from explicit term evidence, never current clock", () => {
  const html = `<main><h1>NSPIRE Sessions</h1><div class="vt-text"><p>The fall 2026 series offers training.</p><p>Sept. 21 | 9:30 a.m. - 3:30 p.m.</p><p>ONLINE-ONLY</p></div></main>`;
  const [e] = parsePublicProse(
    html,
    "https://www.research.vt.edu/events/nspire.html",
    source,
    now,
  ).events;
  assert.equal(e.start, "2026-09-21T13:30:00.000Z");
  assert.equal(e.end, "2026-09-21T19:30:00.000Z");
  assert.equal(e.location, null);
  assert.equal(e.isOnline, true);
  assert.equal(
    parsePublicProse(
      html.replace("fall 2026", "fall"),
      "https://www.research.vt.edu/events/nspire.html",
      source,
      now,
    ).events.length,
    0,
  );
});
test("housing extracts closing deadline rather than opening date and does not require venue", () => {
  const html = `<main><h4>Housing Application Process for 2026-2027</h4><ul><li>Opens at 8 a.m. on Tuesday, January 20, 2026</li><li>Closes at 5 p.m. on Friday, January 23, 2026</li></ul><h4>Spring Classes Begin</h4><li>Tuesday, January 20, 2026</li></main>`;
  const r = parsePublicProse(
    html,
    "https://housing.vt.edu/contracts/events.html",
    source,
    now,
  );
  assert.equal(r.events.length, 0);
  assert.equal(r.deadlines.length, 1);
  assert.equal(r.deadlines[0].dueAt, "2026-01-23T22:00:00.000Z");
});
test("recreation retains explicit event links, rejects unsafe URLs and keeps multiple start times unconfirmed", () => {
  const html = `<main><h2>Toughest Hokie</h2><h3>October 18, 2026 | 10 am &amp; 10:45am</h3><p>Start and finish at the Upper Quad.</p><a href="https://gobblerconnect.vt.edu/recsports/rsvp_boot?id=1">Register</a><a href="javascript:alert(1)">bad</a></main>`;
  const [e] = parsePublicProse(
    html,
    "https://recsports.vt.edu/events.html",
    source,
    now,
  ).events;
  assert.equal(e.timeTBD, true);
  assert.equal(e.location, "Upper Quad");
  assert.equal(
    e.registrationUrl,
    "https://gobblerconnect.vt.edu/recsports/rsvp_boot?id=1",
  );
  assert.equal(e.links?.length, 2);
});
