import ical from "node-ical";
import { load } from "cheerio";
import { DateTime } from "luxon";
import {
  CampusEvent,
  eventSchema,
  categories,
  CAMPUS_TZ,
} from "../../../packages/shared/src/index.js";
import { hash } from "./security.js";
import { remote } from "./config.js";
export const GOBBLER_FEED =
  "https://gobblerconnect.vt.edu/ical/virginiatech/ical_virginiatech.ics";
const text = (s: unknown) =>
  typeof s === "string"
    ? s
    : typeof s === "object" && s && "val" in s
      ? String(s.val)
      : "";
export function classify(s: string): CampusEvent["categories"] {
  const rules = [
    /\b(?:arts?|music\w*|danc\w*|paint\w*|film\w*|theat\w*|craft\w*|pottery)\b/i,
    /\b(?:sports?|soccer|football|volley\w*|basketball|wrestl\w*)\b/i,
    /\b(?:outdoors?|hike\w*|hiking|trails?|nature|climb\w*)\b/i,
    /\b(?:technology|coding|code|scien\w*|engineer\w*|robot\w*|hack\w*)\b/i,
    /\b(?:communit\w*|volunteer\w*|service|cultur\w*|international)\b/i,
    /\b(?:career\w*|internship\w*|resume|networking)\b/i,
    /\b(?:food|coffee|cookies?|social\w*|games?|trivia|dinner|picnic)\b/i,
  ];
  return categories.filter((_, i) => rules[i].test(s));
}
export function normalizeICS(
  raw: string,
  source: "gobblerconnect" | "vt-sports",
  url: string,
  now = new Date(),
): CampusEvent[] {
  const entries = ical.sync.parseICS(raw.replace(/\r\r\n/g, "\r\n")),
    events: CampusEvent[] = [];
  for (const x of Object.values(entries)) {
    if (x.type !== "VEVENT" || !x.start || !x.uid) continue;
    const e: any = x,
      title = text(e.summary),
      description = load(text(e.description)).text().trim(),
      location = text(e.location);
    const parsed = eventSchema.safeParse({
      id: `${source}-${hash(e.uid).slice(0, 24)}`,
      title,
      description: description.slice(0, 12000),
      start: e.start.toISOString(),
      end: e.end && e.end > e.start ? e.end.toISOString() : null,
      timezone: e.start.tz || CAMPUS_TZ,
      location:
        !location || /sign in|download the location/i.test(location)
          ? null
          : location,
      organizer: e.organizer?.params?.CN || null,
      categories:
        source === "vt-sports"
          ? ["Sports"]
          : classify(title + " " + description),
      sources: [
        {
          source,
          sourceId: e.uid,
          url: text(e.url) || url,
          fetchedAt: now.toISOString(),
        },
      ],
      updatedAt: e.lastmodified?.toISOString?.() || now.toISOString(),
      status: e.status === "CANCELLED" ? "cancelled" : "scheduled",
      mode: "live",
      allDay: e.datetype === "date",
    });
    if (parsed.success) events.push(parsed.data);
  }
  return events;
}
export function deduplicate(events: CampusEvent[]): CampusEvent[] {
  const groups = new Map<string, CampusEvent>();
  for (const e of events) {
    const key = [
      e.title.toLowerCase().replace(/[^a-z0-9]/g, ""),
      e.start,
      (e.location || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    ].join("|");
    const old = groups.get(key);
    if (!old) {
      groups.set(key, { ...e, sources: [...e.sources] });
      continue;
    }
    const newer = e.updatedAt > old.updatedAt ? e : old;
    groups.set(key, {
      ...newer,
      id: old.id,
      sources: [...old.sources, ...e.sources].filter(
        (s, i, a) =>
          a.findIndex(
            (t) => t.source === s.source && t.sourceId === s.sourceId,
          ) === i,
      ),
      categories: [...new Set([...old.categories, ...e.categories])],
    });
  }
  return [...groups.values()];
}
export async function fetchGobbler() {
  const first = await fetch(GOBBLER_FEED, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  let response = first;
  if (first.status >= 300 && first.status < 400) {
    const location = new URL(first.headers.get("location") || "", GOBBLER_FEED);
    if (
      location.protocol !== "https:" ||
      location.hostname !== "static-prod-us-east-1.campusgroups.com"
    )
      throw new Error("Campus feed redirected to an unapproved host.");
    response = await remote(location.href);
  }
  if (!response.ok) throw new Error("Campus calendar feed unavailable");
  return normalizeICS(await response.text(), "gobblerconnect", GOBBLER_FEED);
}
// Consume only structured metadata publicly embedded in the official schedule.
// If the provider removes it, fail explicitly instead of guessing an internal API.
export function parseSports(html: string, url: string) {
  const $ = load(html),
    events: CampusEvent[] = [];
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const root = JSON.parse($(s).text());
      const walk = (x: any) => {
        if (!x || typeof x !== "object") return;
        if (
          (x["@type"] === "SportsEvent" || x["@type"] === "Event") &&
          x.startDate
        ) {
          const start = DateTime.fromISO(x.startDate, { zone: CAMPUS_TZ });
          const end = x.endDate
            ? DateTime.fromISO(x.endDate, { zone: CAMPUS_TZ })
            : null;
          const p = eventSchema.safeParse({
            id:
              "vt-sports-" +
              hash(x["@id"] || x.url || x.name + x.startDate).slice(0, 24),
            title: x.name,
            description: load(x.description || "").text(),
            start: start.toUTC().toISO(),
            end: end?.isValid ? end.toUTC().toISO() : null,
            timezone: CAMPUS_TZ,
            location: x.location?.name || null,
            organizer: "Virginia Tech Athletics",
            categories: ["Sports"],
            sources: [
              {
                source: "vt-sports",
                sourceId: x["@id"] || x.url || x.name + x.startDate,
                url: x.url || url,
                fetchedAt: new Date().toISOString(),
              },
            ],
            updatedAt: new Date().toISOString(),
            status: /cancel/i.test(x.eventStatus || "")
              ? "cancelled"
              : "scheduled",
            mode: "live",
            timeTBD: x.eventSchedule?.startTime === "00:00:00",
          });
          if (p.success) events.push(p.data);
        }
        for (const v of Object.values(x))
          if (typeof v === "object")
            Array.isArray(v) ? v.forEach(walk) : walk(v);
      };
      walk(root);
    } catch {}
  });
  return deduplicate(events);
}
export async function fetchSports() {
  const index = "https://hokiesports.com/all-sports-schedule";
  const html = await (await remote(index)).text(),
    $ = load(html);
  const links = [
    ...new Set(
      $("a[href]")
        .toArray()
        .map((a) => new URL($(a).attr("href") || "", index))
        .filter(
          (u) =>
            u.hostname === "hokiesports.com" &&
            /^\/sports\/[^/]+\/schedule$/.test(u.pathname),
        )
        .map((u) => u.href),
    ),
  ].slice(0, 20);
  const events: CampusEvent[] = [];
  for (let i = 0; i < links.length; i += 3) {
    const results = await Promise.allSettled(
      links
        .slice(i, i + 3)
        .map(async (url) => parseSports(await (await remote(url)).text(), url)),
    );
    // Partial snapshots must not remove events from a failed schedule.
    for (const r of results) {
      if (r.status === "rejected")
        throw new Error("An official sports schedule could not be refreshed.");
      events.push(...r.value);
    }
  }
  if (!events.length)
    throw new Error(
      "No structured events were available from the official sport schedules.",
    );
  return deduplicate(events);
}
