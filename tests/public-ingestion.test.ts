import test from "node:test";
import assert from "node:assert/strict";
import { createPublicFetcher } from "../apps/backend/src/public-fetch.js";
import { parsePublicPage } from "../apps/backend/src/public-page-parser.js";
import {
  collectPublicSource,
  semanticHash,
} from "../apps/backend/src/public-ingestion.js";
import type {
  PublicPageCache,
  PublicSourceDefinition,
  PublicSourceRepository,
} from "../packages/shared/src/contracts.js";
const source: PublicSourceDefinition = {
  id: "vt-events",
  label: "University",
  source: "vt-events",
  seeds: ["https://events.vt.edu/events.html"],
  allowedHosts: ["events.vt.edu"],
  kind: "events",
  intervalMs: 1000,
  maxPages: 5,
};
const detail = "https://events.vt.edu/events/2026/09/test.html";
const body = (title = "Workshop") =>
  `<main><h1>${title}</h1><script type="application/ld+json">${JSON.stringify({ "@type": "Event", name: title, startDate: "2026-09-30T18:00:00-04:00", location: { name: "Squires" }, image: "https://events.vt.edu/flyer.jpg", offers: { price: 0, priceCurrency: "USD", url: detail + "?register=1" } })}</script></main>`;
function store() {
  const pages = new Map<string, PublicPageCache>();
  const repo: PublicSourceRepository = {
    pages: async () => [...pages.values()],
    savePage: async (_, page) => {
      pages.set(page.url, page);
    },
  };
  return { repo, pages };
}
test("public fetch rejects hostile redirect hosts and respects conditional 304", async () => {
  const prior: PublicPageCache = {
    url: detail,
    hash: "h",
    etag: '"v1"',
    checkedAt: "2026-01-01T00:00:00Z",
    events: [],
    deadlines: [],
    links: [],
  };
  let headers: HeadersInit | undefined;
  const fetcher = createPublicFetcher(async (_, init) => {
    headers = init?.headers;
    return new Response(null, { status: 304 });
  });
  assert.equal(
    (await fetcher.read(detail, source.allowedHosts, prior)).changed,
    false,
  );
  assert.equal((headers as Record<string, string>)["if-none-match"], '"v1"');
  let requests = 0;
  const bad = createPublicFetcher(async () => {
    requests++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/private" },
    });
  });
  await assert.rejects(bad.read(detail, source.allowedHosts));
  assert.equal(requests, 1);
  await assert.rejects(
    bad.read("https://user:secret@events.vt.edu/events", source.allowedHosts),
  );
  assert.equal(requests, 1);
});
test("unchanged index still checks known details, changes update only affected records", async () => {
  const { repo, pages } = store();
  let version = 1;
  const fetcher = createPublicFetcher(async (url) =>
    String(url) === source.seeds[0]
      ? new Response('<main><a href="' + detail + '">Event</a></main>', {
          headers: { "content-type": "text/html" },
        })
      : new Response(body(version === 1 ? "Workshop" : "Updated workshop"), {
          headers: { "content-type": "text/html" },
        }),
  );
  const first = await collectPublicSource(source, repo, fetcher);
  assert.equal(first.events.length, 1);
  assert.equal(first.changed, true);
  const stable = await collectPublicSource(source, repo, fetcher);
  assert.equal(stable.changed, false);
  assert.equal(stable.changedPages, 0);
  assert.equal(stable.events[0].updatedAt, first.events[0].updatedAt);
  version = 2;
  const updated = await collectPublicSource(source, repo, fetcher);
  assert.equal(updated.events[0].title, "Updated workshop");
  assert.equal(updated.events[0].id, first.events[0].id);
  assert.equal(updated.changedPages, 1);
  assert.equal(pages.size, 2);
});
test("failed and unrecognized detail refreshes preserve prior contributions", async () => {
  const { repo } = store();
  const first = createPublicFetcher(
    async () =>
      new Response(body(), { headers: { "content-type": "text/html" } }),
  );
  await collectPublicSource({ ...source, seeds: [detail] }, repo, first);
  for (const response of [
    new Response("unavailable", { status: 503 }),
    new Response("<main>sign in</main>", {
      headers: { "content-type": "text/html" },
    }),
  ]) {
    const result = await collectPublicSource(
      { ...source, seeds: [detail] },
      repo,
      createPublicFetcher(async () => response),
    );
    assert.equal(result.events.length, 1);
    assert.equal(result.errors, 1);
    assert.equal(result.changed, false);
  }
});
test("structured richness survives validation; publication dates are not event dates", () => {
  const result = parsePublicPage(body(), detail, source);
  assert.equal(
    result.events[0].media?.[0].url,
    "https://events.vt.edu/flyer.jpg",
  );
  assert.equal(result.events[0].admission?.free, true);
  assert.ok(result.events[0].registrationUrl);
  assert.equal(
    parsePublicPage(
      '<main><h1>News</h1><meta property="article:published_time" content="2026-09-30"><p>No activity date</p></main>',
      detail,
      source,
    ).events.length,
    0,
  );
});
test("deadlines use explicit years, reject invalid dates and exclude term-only dates", () => {
  const definition = { ...source, id: "registrar", kind: "deadlines" as const };
  const html =
    "<main><h2>Spring 2027</h2><table><tr><th><h4>Date</h4></th><th>Action</th></tr><tr><td>November 20, 2026</td><td>Last day to register</td></tr><tr><td>January 10, 2027</td><td>Classes begin</td></tr><tr><td>February 30, 2027</td><td>Application deadline</td></tr></table></main>";
  const result = parsePublicPage(html, detail, definition);
  assert.equal(result.deadlines.length, 1);
  assert.equal(result.deadlines[0].dueDate, "2026-11-20");
  assert.equal(result.deadlines[0].term, "Spring 2027");
  assert.equal(result.deadlines[0].dueAt, undefined);
  assert.equal(
    parsePublicPage(
      "<main><p>Application deadline January 22</p></main>",
      detail,
      definition,
    ).deadlines.length,
    0,
  );
});
test("semantic changes ignore observation timestamps but preserve event facts", () => {
  const event = parsePublicPage(body(), detail, source).events[0];
  assert.equal(
    semanticHash(event),
    semanticHash({
      ...event,
      updatedAt: new Date().toISOString(),
      sources: event.sources.map((s) => ({
        ...s,
        fetchedAt: "2000-01-01T00:00:00Z",
      })),
    }),
  );
  assert.notEqual(
    semanticHash(event),
    semanticHash({ ...event, location: "Another room" }),
  );
});
