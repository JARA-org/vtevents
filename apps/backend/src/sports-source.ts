import { createHash } from "node:crypto";
import { load } from "cheerio";
import { DateTime } from "luxon";
import type {
  CampusEvent,
  EventLink,
  SportsDetails,
} from "../../../packages/shared/src/contracts.js";

// Logo references observed on the official football schedule, September 19, 2026.
const footballLogos: Record<string, string> = {
  "Miami": "https://hokiesports.com/imgproxy/H3D8BdEiqRt4EimCdiwZuYjBcDWJh6Ls4ZqpeBXqFbY/rs:fit:1980:0:0:0/g:ce:0:0/q:90/aHR0cHM6Ly9zdG9yYWdlLmdvb2dsZWFwaXMuY29tL3ZpcmdpbmlhdGVjaC1wcm9kLzIwMjQvMDUvMDgvZXBEUkFaNkJxd1Z4cVJFUkRqVEN2R1B3cmo0Y1JLa2N4Q3E0SnViZS5wbmc.png",
  "Old Dominion": "https://storage.googleapis.com/virginiatech-prod/school_logos/pYMnmvBqUrcrqxaFklzs3EyKPeZcARiDV6O74wkj.svg",
  "Maryland": "https://storage.googleapis.com/virginiatech-prod/school_logos/f8o61tEmiA04lnY2gaNWqr1w092afU3rjesl4OIv.svg",
  "Boston College": "https://storage.googleapis.com/virginiatech-prod/school_logos/tlSjYziGFTtEtcBfDjXQU5d5JuLZXuO5F7mArvEK.svg",
  "Pitt": "https://storage.googleapis.com/virginiatech-prod/school_logos/VpGQvwBwg8gJE8BO6jCl8mMC1iUUwsYlfADmSF8w.svg",
  "Cal": "https://storage.googleapis.com/virginiatech-prod/school_logos/APeYosuqoV2NKbNaQ0lugPj1cuiVHMCGIpzBGN4a.svg",
  "Georgia Tech": "https://storage.googleapis.com/virginiatech-prod/school_logos/Mf5OJROzoNgXFq8IN25amdYXoIuad81jvdz9eESZ.svg",
  "Clemson": "https://storage.googleapis.com/virginiatech-prod/school_logos/2W4u8QzWTdGRitz46i2R8PL2zXba0NLY8Z395RqW.svg",
  "SMU": "https://storage.googleapis.com/virginiatech-prod/school_logos/6VHqhjHXQKOCHBeez6zi14DCsfy9b41JQzz8sL3r.svg",
  "Stanford": "https://storage.googleapis.com/virginiatech-prod/school_logos/rkU7iU4mHQWoJ43rZfcz2UiK0ZtlfGql1dtivMzv.svg",
  "Virginia": "https://storage.googleapis.com/virginiatech-prod/school_logos/P6ZR1uoJNOPlS15vcffvGecDqYHbajsr9ZmqUB63.svg"
};
const vtFootballLogo = "https://hokiesports.com/imgproxy/FNEpBtpXKou1WseMU5HcoTNNJvWe5iTuBEEd8W-gmXU/rs:fit:1980:0:0:0/g:ce:0:0/q:90/aHR0cHM6Ly9zdG9yYWdlLmdvb2dsZWFwaXMuY29tL3ZpcmdpbmlhdGVjaC1wcm9kLzIwMjQvMDMvMTkvS1EzUnNZS2RoMEZUdEp4R1dnR3ROcG5SamgwRDlkMVJuNklOMGY5Qy5wbmc.png";
const ZONE = "America/New_York";
const record = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, unknown>)
    : {};
const text = (x: unknown): string => (typeof x === "string" ? x : "");
const clean = (x: unknown) => load(text(x)).text().replace(/\s+/g, " ").trim();
function link(value: unknown, base: string): string | undefined {
  if (!text(value)) return;
  try {
    const u = new URL(text(value), base);
    if (/^https?:$/.test(u.protocol) && !u.username && !u.password)
      return u.href;
  } catch {
    /* Invalid provider URL. */
  }
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 24);

/** Pure discovery of official schedule links from fetched HTML. No effects, permissions,
 * retries or transaction; malformed/off-origin links are excluded, repeated calls are stable. */
export function discoverSportsSchedules(html: string, url: string): string[] {
  const $ = load(html),
    found = new Set<string>();
  $("a[href]").each((_, node) => {
    const href = link($(node).attr("href"), url);
    if (!href) return;
    const u = new URL(href);
    if (
      u.protocol === "https:" &&
      u.hostname === "hokiesports.com" &&
      /^\/sports\/[^/]+\/schedule\/?$/.test(u.pathname)
    ) {
      u.search = "";
      u.hash = "";
      u.pathname = u.pathname.replace(/\/$/, "");
      found.add(u.href);
    }
  });
  return [...found].sort();
}

/** Parse only public structured event metadata and matching rendered schedule rows.
 * Input HTML is untrusted data; scripts are never executed. Returns public sports DTOs,
 * no network/storage/model effects or caller privileges. Invalid event dates are omitted;
 * missing structured data returns [] so ingestion can fail closed, not clear a snapshot.
 * Idempotent for identical input/clock, no retries or transaction. */
export function parseHokieSports(
  html: string,
  url: string,
  now = new Date(),
): CampusEvent[] {
  const $ = load(html),
    candidates: Record<string, unknown>[] = [];
  const walk = (value: unknown, depth = 0): void => {
    if (
      depth > 30 ||
      candidates.length > 2000 ||
      !value ||
      typeof value !== "object"
    )
      return;
    if (Array.isArray(value)) {
      value.forEach((x) => walk(x, depth + 1));
      return;
    }
    const x = record(value),
      kinds = Array.isArray(x["@type"]) ? x["@type"] : [x["@type"]];
    if (kinds.some((k) => k === "SportsEvent" || k === "Event") && x.startDate)
      candidates.push(x);
    for (const child of Object.values(x))
      if (child && typeof child === "object") walk(child, depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, node) => {
    try {
      walk(JSON.parse($(node).text()));
    } catch {
      /* Invalid metadata is not executable. */
    }
  });
  const events = new Map<string, CampusEvent>();
  const rows = $(".schedule-event-block").toArray();
  const sportFromPage =
    clean($("h1").first().text()).replace(
      /\s+(?:\d{4}(?:-\d{2,4})?\s+)?Schedule.*$/i,
      "",
    ) ||
    new URL(url).pathname.match(/\/sports\/([^/]+)/)?.[1]?.replace(/-/g, " ") ||
    "Athletics";
  for (const x of candidates) {
    const title = clean(x.name),
      schedule = record(x.eventSchedule);
    const zone = text(schedule.scheduleTimezone) || ZONE;
    const start = DateTime.fromISO(text(x.startDate), { zone });
    if (!title || !start.isValid) continue;
    const localDate =
      text(schedule.startDate).slice(0, 10) || start.setZone(zone).toISODate()!;
    if (!DateTime.fromISO(localDate, { zone }).isValid) continue;
    const opponent = title.replace(/^Virginia Tech\s+(?:vs\.?|at)\s+/i, "");
    // Matching requires both opponent and calendar date; a repeated opponent alone is not identity.
    const matching = rows.filter((node) => {
      const row = $(node),
        name = clean(row.find(".schedule-default-team__opponent-name").text());
      const dateText = clean(row.find(".schedule-event-date").text());
      const day = start.setZone(zone).toFormat("MMM d");
      return (
        name === opponent && new RegExp(`${day}\\b`, "i").test(dateText)
      );
    });
    const row = matching.length === 1 ? $(matching[0]) : $([]);
    const providerId = row
      .find('[entity-name="schedule-events"][entity-id]')
      .attr("entity-id");
    const sourceId =
      providerId || text(x["@id"]) || text(x.url) || `${title}|${localDate}`;
    const sourceUrl = link(x.url, url) || url;
    const links: EventLink[] = [
      { label: "Official schedule", url: sourceUrl, kind: "source" },
    ];
    row.find("a[href]").each((_, node) => {
      const a = $(node),
        href = link(a.attr("href"), url),
        label =
          clean(a.text())
            .replace(/Opens in a new window/gi, "")
            .trim() || clean(a.attr("aria-label"));
      if (!href || !label || links.some((l) => l.url === href)) return;
      const kind: EventLink["kind"] = /ticket/i.test(label)
        ? "tickets"
        : /watch|listen|stream/i.test(label)
          ? "stream"
          : /stats|box score/i.test(label)
            ? "stats"
            : /recap/i.test(label)
              ? "recap"
              : "other";
      links.push({ label, url: href, kind });
    });
    const venueText = clean(
      row.find(".schedule-event-block__location-venue").text(),
    ).toLowerCase();
    const venueType: SportsDetails["venueType"] =
      venueText === "home" || venueText === "away" || venueText === "neutral"
        ? venueText
        : "unknown";
    const result = clean(row.find(".schedule-event-item-result__label").text());
    const statusText = `${text(x.eventStatus)} ${result}`;
    const state: SportsDetails["state"] = /cancel/i.test(statusText)
      ? "cancelled"
      : /postpon/i.test(statusText)
        ? "postponed"
        : /\b[WLTD]\b.*\d+\s*-\s*\d+|\bfinal\b/i.test(result)
          ? "final"
          : /\blive\b/i.test(statusText)
            ? "live"
            : start.toMillis() > now.getTime()
              ? "upcoming"
              : "unknown";
    const timeTBD =
      schedule.startTime === "00:00:00" ||
      /^\d{4}-\d{2}-\d{2}$/.test(text(x.startDate)) ||
      /\bTBA\b|\bTBD\b/i.test(clean(row.find(".schedule-event-date").text()));
    const end = x.endDate ? DateTime.fromISO(text(x.endDate), { zone }) : null;
    const endIso =
      !timeTBD && end?.isValid && end.toMillis() > start.toMillis()
        ? end.toUTC().toISO()
        : null;
    const media: NonNullable<CampusEvent["media"]> = [];
    const addImage = (value: unknown, alt?: string, credit?: string) => {
      const href = link(value, url);
      if (href && !media.some((m) => m.url === href))
        media.push({
          url: href,
          kind: "image",
          ...(alt ? { alt } : {}),
          ...(credit ? { credit } : {}),
          sourceUrl,
        });
    };
    for (const value of Array.isArray(x.image) ? x.image : [x.image]) {
      const image = record(value);
      addImage(
        typeof value === "string" ? value : image.url || image.contentUrl,
        clean(image.caption),
        clean(image.creditText),
      );
    }
    row.find("img").each((_, node) => {
      const image = $(node);
      addImage(image.attr("data-src") || image.attr("src"), image.attr("alt"));
    });
    const teams = [record(x.homeTeam), record(x.awayTeam)];
    const opponentTeam = teams.find(
      (t) => clean(t.name) && !/^Virginia Tech\b/i.test(clean(t.name)),
    );
    const football = /football/i.test(clean(x.sport) || sportFromPage);
    const opponentLogoUrl =
      link(opponentTeam?.logo, url) ||
      link(
        row.find(".schedule-default-team__image").attr("data-src") ||
          row.find(".schedule-default-team__image").attr("src"),
        url,
      );
    const teamLogo = opponentLogoUrl || (football ? footballLogos[opponent] : undefined);
    if (teamLogo) addImage(teamLogo, opponent);
    if (football) addImage(vtFootballLogo, "Virginia Tech football logo");
    const sports: SportsDetails = {
      sport: clean(x.sport) || sportFromPage,
      opponent: opponent || null,
      venueType,
      state,
      checkedAt: now.toISOString(),
      ...(teamLogo ? { opponentLogoUrl: teamLogo } : {}),
    };
    const scores = result.match(/\b(\d+)\s*-\s*(\d+)\b/);
    if (scores && (venueType === "home" || venueType === "away")) {
      sports.homeScore = venueType === "home" ? scores[1] : scores[2];
      sports.awayScore = venueType === "home" ? scores[2] : scores[1];
    }
    const updated = DateTime.fromISO(text(x.dateModified));
    const event: CampusEvent = {
      id: `vt-sports-${digest(sourceId)}`,
      title,
      description: [
        clean(x.description),
        clean(row.find(".schedule-default-team__promo-title").text()),
      ]
        .filter(Boolean)
        .join("\n"),
      start: (timeTBD ? DateTime.fromISO(localDate, { zone }) : start)
        .toUTC()
        .toISO()!,
      end: endIso,
      timezone: zone,
      location:
        clean(row.find(".schedule-default-team__venue").text()) ||
        clean(record(x.location).name) ||
        null,
      organizer: "Virginia Tech Athletics",
      categories: ["Sports"],
      sources: [
        {
          source: "vt-sports",
          sourceId,
          url: sourceUrl,
          fetchedAt: now.toISOString(),
          sourceUpdatedAt: updated.isValid ? updated.toUTC().toISO() : null,
        },
      ],
      updatedAt: updated.isValid ? updated.toUTC().toISO()! : now.toISOString(),
      status: state === "cancelled" ? "cancelled" : "scheduled",
      mode: "live",
      timeTBD,
      allDay: false,
      endEstimated: false,
      sports,
      links,
      media,
      visibility: { kind: "public" },
      timeDetails: {
        precision: timeTBD ? "date_only" : endIso ? "confirmed" : "start_only",
        startDate: localDate,
        confirmedStart: timeTBD ? null : start.toUTC().toISO(),
        confirmedEnd: endIso,
      },
    };
    // WMT repeats a final game as SportsEvent and Event: prefer richer metadata,
    // but never collapse separate provider IDs or date/opponent occurrences.
    const old = events.get(event.id);
    if (!old || text(x["@type"]) === "SportsEvent") events.set(event.id, event);
  }
  return [...events.values()];
}
