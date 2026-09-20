import { load } from "cheerio";
import { DateTime } from "luxon";
import { createHash } from "node:crypto";
import { eventSchema, CAMPUS_TZ } from "./domain.js";
import { parsePublicProse } from "./public-prose.js";
import { RESEARCH_SHEET_URL, parseResearchSheet } from "./research-sheet.js";
import type {
  CampusEvent,
  CampusDeadline,
  PublicSourceDefinition,
  EventMedia,
} from "../../../packages/shared/src/contracts.js";
const hash = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 24);
const text = (v: unknown): string =>
  typeof v === "string" ? load(v).text().replace(/\s+/g, " ").trim() : "";
export function safePublicUrl(
  value: unknown,
  base: string,
): string | undefined {
  try {
    if (typeof value !== "string" || !value) return;
    const u = new URL(value, base);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return;
    return u.href;
  } catch {
    return;
  }
}
const month =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
/** Explicit source dates only: no fetch-time year inference. */
export function sourceDate(value: string, year?: string): DateTime | undefined {
  const numeric = value.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (numeric) {
    const d = DateTime.fromObject(
      {
        year: Number(numeric[3]),
        month: Number(numeric[1]),
        day: Number(numeric[2]),
      },
      { zone: CAMPUS_TZ },
    );
    return d.isValid ? d : undefined;
  }
  const iso = value.match(
    /\b(20\d{2}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?/,
  );
  if (iso) {
    const d = DateTime.fromISO(iso[0], { zone: CAMPUS_TZ });
    return d.isValid ? d : undefined;
  }
  const m = value
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .match(
      new RegExp(`\\b(${month})\\.?\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?`, "i"),
    );
  if (!m || !(m[3] || year)) return;
  const name = m[1].slice(0, 3).toLowerCase(),
    n =
      [
        "jan",
        "feb",
        "mar",
        "apr",
        "may",
        "jun",
        "jul",
        "aug",
        "sep",
        "oct",
        "nov",
        "dec",
      ].indexOf(name) + 1;
  const d = DateTime.fromObject(
    { year: Number(m[3] || year), month: n, day: Number(m[2]) },
    { zone: CAMPUS_TZ },
  );
  return d.isValid ? d : undefined;
}
/** Pure structured/event-detail extraction. Returns only grounded records; unrecognized pages stay empty. */
export function parsePublicPage(
  body: string,
  url: string,
  source: PublicSourceDefinition,
  now = new Date(),
) {
  if(url===RESEARCH_SHEET_URL)return parseResearchSheet(body,url,source);
  const $ = load(body),
    events: CampusEvent[] = [],
    deadlines: CampusDeadline[] = [];
  const checkedAt = now.toISOString();
  const reference = (id: string) => ({
    source: source.source,
    providerId: source.id,
    label: source.label,
    sourceId: `${source.id}:${id}`,
    url,
    fetchedAt: checkedAt,
  });
  const media = (value: unknown): EventMedia[] => {
    const values = Array.isArray(value) ? value : [value];
    return values
      .flatMap((v) => {
        const u = safePublicUrl(
          typeof v === "object" && v
            ? (v as Record<string, unknown>).url ||
                (v as Record<string, unknown>).contentUrl
            : v,
          url,
        );
        return u ? [{ url: u, kind: "image" as const, sourceUrl: url }] : [];
      })
      .slice(0, 30);
  };
  const og = media($('meta[property="og:image"]').attr("content"));
  const add = (x: Record<string, any>) => {
    const start =
      typeof x.startDate === "string" ? sourceDate(x.startDate) : undefined;
    if (!start) return;
    const locations = Array.isArray(x.location) ? x.location : [x.location];
    const physical = locations.find(
      (p: any) => p && p["@type"] !== "VirtualLocation",
    );
    const virtual = locations.find(
      (p: any) => p?.["@type"] === "VirtualLocation",
    );
    const location =
      typeof physical === "string" ? text(physical) : text(physical?.name);
    const onlineUrl = safePublicUrl(virtual?.url, url);
    if (
      !location &&
      !onlineUrl &&
      !/OnlineEventAttendanceMode/.test(x.eventAttendanceMode || "")
    )
      return;
    const address = physical?.address;
    const addressText =
      typeof address === "string"
        ? text(address)
        : address
          ? [
              address.streetAddress,
              address.addressLocality,
              address.addressRegion,
              address.postalCode,
            ]
              .filter(Boolean)
              .join(", ")
          : undefined;
    const canonical = safePublicUrl(x.url, url) || url;
    const id = String(x["@id"] || canonical);
    const dateOnly = !/T\d{2}:\d{2}/.test(x.startDate),
      end = x.endDate ? sourceDate(x.endDate) : undefined;
    const offers = Array.isArray(x.offers) ? x.offers[0] : x.offers;
    const organizer = Array.isArray(x.organizer) ? x.organizer[0] : x.organizer;
    const parsed = eventSchema.safeParse({
      id: `${source.id}-${hash(id)}`,
      title: text(x.name),
      description: text(x.description).slice(0, 12000),
      start: start.toUTC().toISO(),
      end: end && end > start ? end.toUTC().toISO() : null,
      timezone: CAMPUS_TZ,
      location: location || null,
      onlineUrl: onlineUrl || null,
      isOnline:
        !!virtual ||
        /OnlineEventAttendanceMode|MixedEventAttendanceMode/.test(
          x.eventAttendanceMode || "",
        ),
      organizer:
        text(typeof organizer === "string" ? organizer : organizer?.name) ||
        null,
      organizerUrl: safePublicUrl(organizer?.url, url),
      categories: [],
      sources: [{ ...reference(id), url: canonical }],
      updatedAt:
        sourceDate(x.dateModified || "")
          ?.toUTC()
          .toISO() || checkedAt,
      status: /EventCancelled/.test(x.eventStatus || "")
        ? "cancelled"
        : "scheduled",
      mode: "live",
      timeTBD: dateOnly,
      allDay: false,
      endEstimated: false,
      timeDetails: {
        precision: dateOnly ? "date_only" : end ? "confirmed" : "start_only",
        startDate: start.toISODate(),
        confirmedStart: dateOnly ? null : start.toUTC().toISO(),
        confirmedEnd: end?.toUTC().toISO() || null,
      },
      media: media(x.image).length ? media(x.image) : og,
      address: addressText,
      admission: offers
        ? {
            price: offers.price == null ? undefined : String(offers.price),
            currency: offers.priceCurrency,
            free: offers.price != null && Number(offers.price) === 0,
            availability: offers.availability,
          }
        : undefined,
      registrationUrl: safePublicUrl(offers?.url, url),
      links: [
        { label: "Event details", url: canonical, kind: "source" },
        ...(safePublicUrl(offers?.url, url)
          ? [
              {
                label: "Registration / tickets",
                url: safePublicUrl(offers.url, url),
                kind: "tickets",
              },
            ]
          : []),
      ],
    });
    if (parsed.success) events.push(parsed.data);
  };
  const walk = (x: any, depth = 0) => {
    if (!x || typeof x !== "object" || depth > 16) return;
    const types = Array.isArray(x["@type"]) ? x["@type"] : [x["@type"]];
    if (types.some((t: unknown) => typeof t === "string" && /Event$/.test(t)))
      add(x);
    for (const child of Object.values(x))
      if (typeof child === "object")
        Array.isArray(child)
          ? child.forEach((v) => walk(v, depth + 1))
          : walk(child, depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {}
  });
  const researchLinks = source.id === "research" ? $("a[href]").toArray().map(el => $(el).attr("href")).filter((href):href is string => !!href && /\/events\/[^/]+\.html$/.test(href) && !/archive/.test(href)) : [];
  const main = $("main").length ? $("main") : $("body");
  main.find("script,style,nav,footer,header").remove();
  if (source.kind === "deadlines" || source.kind === "mixed") {
    let term = "",
      year: string | undefined;
    main.find("h2,h3,h4,tr,li,p").each((_, el) => {
      const node = $(el),
        line = text(node.text());
      if (/^h[234]$/.test(el.tagName)) {
        if (node.closest("table").length) return;
        term = line;
        const years = line.match(/20\d{2}/g);
        year = years?.length === 1 ? years[0] : undefined;
        return;
      }
      if (
        (!/deadline|last day|due(?: date)?|apply by|register by|applications? close|payment.*(?:by|due)/i.test(
          line,
        ) &&
          !(source.id === "bursar" && el.tagName === "tr")) ||
        line.length > 2200
      )
        return;
      const date = sourceDate(line, year);
      if (!date) return;
      const title = (
          source.id === "bursar" ? "Payment deadline: " + line : line
        ).slice(0, 300),
        native = hash(
          `${url}|${term}|${line.replace(new RegExp(`${month}\\.?\\s+\\d{1,2}(?:,?\\s+20\\d{2})?`, "gi"), "")}`,
        );
      const dueAtMatch = line.match(
        /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i,
      );
      let dueAt: string | undefined;
      if (dueAtMatch) {
        const hr = Number(dueAtMatch[1]);
        if (hr >= 1 && hr <= 12 && Number(dueAtMatch[2] || 0) < 60)
          dueAt =
            date
              .set({
                hour: (hr % 12) + (/^p/i.test(dueAtMatch[3]) ? 12 : 0),
                minute: Number(dueAtMatch[2] || 0),
              })
              .toUTC()
              .toISO() || undefined;
      }
      deadlines.push({
        id: `deadline-${source.id}-${native}`,
        title,
        description: line,
        dueDate: date.toISODate()!,
        ...(dueAt ? { dueAt } : {}),
        timezone: CAMPUS_TZ,
        ...(term ? { term } : {}),
        sources: [reference(native)],
        updatedAt: checkedAt,
        status: "active",
        submissionUrl: safePublicUrl(
          node.find("a[href]").first().attr("href"),
          url,
        ),
      });
    });
  }
  // Explicit dated detail pages without JSON-LD: scoped event content only, never article publication metadata.
  if (
    !events.length &&
    source.kind !== "deadlines" &&
    /\/(?:events?|performances|exhibitions)\/.+/.test(new URL(url).pathname)
  ) {
    const content = text(main.text()),
      title = text(main.find("h1").first().text());
    const date = sourceDate(content);
    const venue = content.match(
      /(?:Location|Venue|Where)\s*:\s*([^|\n]{3,120}?)(?=\s(?:Date|Time|Register|Contact|Cost)\s*:|$)/i,
    )?.[1];
    const online = main
      .find(
        'a[href*="zoom.us/"],a[href*="teams.microsoft.com/"],a[href*="youtube.com/watch"]',
      )
      .first()
      .attr("href");
    if (title && date && (venue || online))
      add({
        name: title,
        description: content.slice(0, 12000),
        startDate: date.toISODate(),
        location: venue
          ? { name: venue }
          : { "@type": "VirtualLocation", url: online },
        image: og.map((m) => m.url),
        url,
      });
  }
  const links = [
    ...new Set(
      main
        .find("a[href]")
        .toArray()
        .flatMap((el) => {
          const u = safePublicUrl($(el).attr("href"), url);
          if (!u) return [];
          const parsed = new URL(u);
          parsed.hash = "";
          if (
            !source.allowedHosts.includes(parsed.hostname) ||
            parsed.protocol !== "https:"
          )
            return [];
          const label = text($(el).text());
          return /\.(?:ics)(?:\/|\?|$)|\/ical(?:\/|$)|\/events?(?:\/|\?|\.html)|\/performances\/|\/exhibitions\/|\/calendar|\/rsvp_boot/i.test(
            parsed.pathname + parsed.search,
          ) || /deadline|important dates|due dates/i.test(label)
            ? [parsed.href]
            : [];
        }),
    ),
  ].slice(0, 500);
  const specialized = parsePublicProse(body, url, source, now);
  for (const href of researchLinks) {
    const link=safePublicUrl(href,url);
    if(link&&source.allowedHosts.includes(new URL(link).hostname)&&!links.includes(link))links.push(link);
  }
  for (const href of researchLinks) {
    const link=safePublicUrl(href,url);
    if(link&&source.allowedHosts.includes(new URL(link).hostname)&&!links.includes(link))links.push(link);
  }
  const parsedEvents = specialized.events.length ? specialized.events : events;
  const parsedDeadlines = specialized.deadlines.length
    ? specialized.deadlines
    : deadlines;
  return {
    events: [...new Map(parsedEvents.map((e) => [e.id, e])).values()],
    deadlines: [...new Map(parsedDeadlines.map((d) => [d.id, d])).values()],
    links,
  };
}
