import ical from "node-ical";
import { load } from "cheerio";
import { parseHokieSports } from "./sports-source.js";
import { consolidateEvents } from "./event-consolidation.js";
import { CampusEvent, eventSchema, categories, CAMPUS_TZ } from "./domain.js";
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
    /\b(?:arts?|music\w*|danc\w*|paint\w*|film\w*|theat\w*|craft\w*|pottery|quartet|orchestra|ensemble|concert|bluegrass|jazz|gallery|exhibit\w*)\b/i,
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
  source: "gobblerconnect" | "vt-sports" | "vt-events",
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
    const descriptionHtml=load(text(e.description));
    const safe=(value:unknown)=>{try{if(typeof value!=="string"||!value)return undefined;const u=new URL(value,url);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}};
    const media=descriptionHtml("img[src]").toArray().flatMap(node=>{const image=safe(descriptionHtml(node).attr("src"));return image?[{url:image,kind:"image" as const,alt:descriptionHtml(node).attr("alt"),sourceUrl:safe(text(e.url))||url}]:[];}).slice(0,30);
    const links=descriptionHtml("a[href]").toArray().flatMap(node=>{const link=safe(descriptionHtml(node).attr("href"));return link?[{url:link,label:descriptionHtml(node).text().trim().slice(0,300)||"Event link",kind:"other" as const}]:[];}).slice(0,50);
    const parsed = eventSchema.safeParse({
      id: `${source}-${hash(e.uid).slice(0, 24)}`,
      title,
      description: description.slice(0, 12000),
      media,
      links,
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
export function deduplicate(events: CampusEvent[]): CampusEvent[] { return consolidateEvents(events); }
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
export function parseSports(html: string, url: string) { return parseHokieSports(html, url); }
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
