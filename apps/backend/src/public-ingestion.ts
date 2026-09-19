import { load } from "cheerio";
import { createHash } from "node:crypto";
import type {
  PublicSourceDefinition,
  PublicSourceRepository,
  PublicPageFetcher,
  PublicSourceBatch,
  PublicPageCache,
} from "../../../packages/shared/src/contracts.js";
import { parsePublicPage } from "./public-page-parser.js";
import { normalizeICS } from "./sources.js";
import { parseHokieSports, discoverSportsSchedules } from "./sports-source.js";
import { eventSchema, deadlineSchema } from "./domain.js";
const PARSER_VERSION = "public-events-2026-09-19-v3";

/** Content-only revisions: fetching/checking/generated ICS timestamps never create event revisions. */
export function semanticHash(value: unknown): string {
  const clean = (x: any): any =>
    Array.isArray(x)
      ? x.map(clean)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.keys(x)
              .sort()
              .filter(
                (k) =>
                  ![
                    "fetchedAt",
                    "updatedAt",
                    "checkedAt",
                    "sourceUpdatedAt",
                    "revision",
                    "stale",
                  ].includes(k),
              )
              .map((k) => [k, clean(x[k])]),
          )
        : x;
  return createHash("sha256")
    .update(JSON.stringify(clean(value)))
    .digest("hex");
}
/** Public, operator-configured bounded crawl. Conditional checks always include known detail pages,
 * even if indexes are unchanged. Writes only successful page checkpoints; failures preserve prior data.
 * No AI or provider mutations. Safe to retry: semantic revisions are idempotent. */
export async function collectPublicSource(
  source: PublicSourceDefinition,
  repository: PublicSourceRepository,
  fetcher: PublicPageFetcher,
): Promise<PublicSourceBatch> {
  const prior = await repository.pages(source.id),
    pages = new Map(prior.map((p) => [p.url, p]));
  const before = semanticHash(
    prior
      .filter(p => source.id !== "gobblerconnect" || source.seeds.includes(p.url))
      .flatMap((p) => [...p.events.map(e => source.id === "gobblerconnect" && pages.get(e.sources[0]?.url)?.events[0]?.media?.length ? {...e, media: pages.get(e.sources[0].url)!.events[0].media} : e), ...p.deadlines])
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  const discovered = [...new Set(prior.flatMap((p) => p.links))].filter(
    (url) => !pages.has(url),
  );
  const known = prior
    .filter((p) => source.id !== "gobblerconnect" && !source.seeds.includes(p.url))
    .sort((a, b) => a.checkedAt.localeCompare(b.checkedAt))
    .map((p) => p.url);
  // Balance discovery and revisits so a long listing cannot starve existing details indefinitely.
  const queued = [...source.seeds];
  for (let i = 0; i < Math.max(discovered.length, known.length); i++) {
    if (discovered[i]) queued.push(discovered[i]);
    if (known[i]) queued.push(known[i]);
  }
  const seen = new Set<string>();
  let errors = 0,
    changedPages = 0;
  while (queued.length && seen.size < source.maxPages) {
    const url = queued.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const old = pages.get(url);
    try {
      const response = await fetcher.read(url, source.allowedHosts, old?.parserVersion===PARSER_VERSION ? old : undefined);
      let parsed = old
        ? { events: old.events, deadlines: old.deadlines, links: old.links }
        : ({ events: [], deadlines: [], links: [] } as Pick<
            PublicPageCache,
            "events" | "deadlines" | "links"
          >);
      if (response.removed) {
        // Seed failure is not proof that every item from a feed was cancelled.
        if (source.seeds.includes(url))
          throw new Error("Public source seed missing");
        parsed = {
          events: (old?.events || []).map((e) => ({
            ...e,
            status: "cancelled" as const,
          })),
          deadlines: (old?.deadlines || []).map((d) => ({
            ...d,
            status: "withdrawn" as const,
          })),
          links: [],
        };
      } else if (response.changed && response.body !== undefined) {
        if (/BEGIN:VCALENDAR/.test(response.body.slice(0, 200)))
          parsed = {
            events: normalizeICS(response.body, source.source, url).map(
              (e) => ({
                ...e,
                sources: e.sources.map((s) => ({
                  ...s,
                  providerId: source.id,
                  label: source.label,
                })),
              }),
            ),
            deadlines: [],
            links: [],
          };
        else if (source.kind === "sports")
          parsed = {
            events: parseHokieSports(response.body, url),
            deadlines: [],
            links: discoverSportsSchedules(response.body, url),
          };
        else parsed = parsePublicPage(response.body, url, source);
        if (
          old &&
          (old.events.length || old.deadlines.length) &&
          !parsed.events.length &&
          !parsed.deadlines.length
        )
          throw new Error("Previously recognized page no longer parses");
      }
      parsed.events=parsed.events.map(e=>({...e,...eventSchema.parse(e)}));
      parsed.deadlines=parsed.deadlines.map(d=>deadlineSchema.parse(d));
      const oldEvents = new Map((old?.events || []).map((e) => [e.id, e]));
      parsed.events = parsed.events.map((e) => {
        const prior = oldEvents.get(e.id);
        return prior && semanticHash(prior) === semanticHash(e)
          ? prior
          : { ...e, revision: semanticHash(e) };
      });
      const oldDeadlines = new Map(
        (old?.deadlines || []).map((d) => [d.id, d]),
      );
      parsed.deadlines = parsed.deadlines.map((d) => {
        const prior = oldDeadlines.get(d.id);
        return prior && semanticHash(prior) === semanticHash(d) ? prior : d;
      });
      const page: PublicPageCache = {
        parserVersion: PARSER_VERSION,
        url,
        hash: response.hash,
        etag: response.etag,
        lastModified: response.lastModified,
        checkedAt: response.checkedAt,
        ...parsed,
      };
      await repository.savePage(source.id, page);
      pages.set(url, page);
      if (
        !old ||
        semanticHash({ events: old.events, deadlines: old.deadlines }) !==
          semanticHash({ events: page.events, deadlines: page.deadlines })
      )
        changedPages++;
      for (const link of parsed.links)
        if (!seen.has(link) && !queued.includes(link)) {
          if (/\.ics(?:\/|\?|$)|\/ical(?:\/|$)/i.test(link)) queued.unshift(link);
          else queued.push(link);
        }
    } catch {
      errors++;
    }
  }
  const events = [
    ...new Map(
      [...pages.values()].filter(p => source.id !== "gobblerconnect" || source.seeds.includes(p.url)).flatMap((p) => p.events).map((e) => [e.id, e]),
    ).values(),
  ];
  // Public event covers are absent from the ICS feed. Cache bounded detail reads;
  // failures retain the previous cover and never erase event records.
  if (source.id === "gobblerconnect") {
    let reads = 0;
    const upcoming = events.filter(e => Date.parse(e.end || e.start) >= Date.now()).sort((a,b) => a.start.localeCompare(b.start));
    for (const event of upcoming) {
      const url = event.sources[0]?.url;
      if (!url) continue;
      const u = new URL(url);
      if (u.origin !== "https://gobblerconnect.vt.edu" || u.pathname !== "/rsvp" || !/^\d+$/.test(u.searchParams.get("id") || "")) continue;
      let cached = pages.get(url);
      if (reads < 20 && (!cached || Date.now() - Date.parse(cached.checkedAt) > 86400000)) {
        reads++;
        try {
          const response = await fetcher.read(url, source.allowedHosts, cached);
          let media = cached?.events[0]?.media || [];
          if (response.changed && response.body) {
            const $ = load(response.body);
            const raw = $('meta[property="og:image"]').attr("content");
            if (raw) {
              const image = new URL(raw, url);
              if (image.protocol === "https:" && !image.username && !image.password)
                media = [{ kind: "image", url: image.href, alt: event.title, sourceUrl: url }];
            }
          }
          cached = { url, hash: response.hash, etag: response.etag, lastModified: response.lastModified, checkedAt: response.checkedAt, parserVersion: PARSER_VERSION, events: [{...event, media}], deadlines: [], links: [] };
          await repository.savePage(source.id, cached);
          pages.set(url, cached);
        } catch { /* A missing photo never makes an otherwise valid event unavailable. */ }
      }
      if (cached?.events[0]?.media?.length) event.media = cached.events[0].media;
    }
  }
  const deadlines = [
    ...new Map(
      [...pages.values()].flatMap((p) => p.deadlines).map((d) => [d.id, d]),
    ).values(),
  ];
  const after = semanticHash(
    [...events, ...deadlines].sort((a, b) => a.id.localeCompare(b.id)),
  );
  return {
    events,
    deadlines,
    changed: before !== after,
    checkedAt: new Date().toISOString(),
    pagesChecked: seen.size,
    changedPages,
    errors,
    hasMore: queued.some((u) => !seen.has(u)),
  };
}
