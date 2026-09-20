import { createHash } from "node:crypto";
import { load } from "cheerio";
import { DateTime } from "luxon";
import type {
  CampusEvent,
  CampusDeadline,
  PublicSourceDefinition,
  EventMedia,
} from "../../../packages/shared/src/contracts.js";

const ZONE = "America/New_York";
const MONTH =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const hash = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 24);
const safe = (s: string | undefined, base: string) => {
  try {
    if (!s) return;
    const u = new URL(s, base);
    if (/^https?:$/.test(u.protocol) && !u.username && !u.password)
      return u.href;
  } catch {}
};
function date(value: string, year?: number): DateTime | undefined {
  const a = value.match(
    new RegExp(`\\b(${MONTH})\\.?\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?`, "i"),
  );
  const b = value.match(new RegExp(`^(\\d{1,2})[ -](${MONTH})\\b`, "i"));
  const name = (a?.[1] || b?.[2] || "").slice(0, 3).toLowerCase();
  const explicitYear =
    a?.[3] || (b ? value.match(/\b20\d{2}\b/)?.[0] : undefined);
  if (!name || !(explicitYear || year)) return;
  const d = DateTime.fromObject(
    {
      year: Number(explicitYear || year),
      month:
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
        ].indexOf(name) + 1,
      day: Number(a?.[2] || b?.[1]),
    },
    { zone: ZONE },
  );
  return d.isValid ? d : undefined;
}
function clock(
  value: string,
  day: DateTime,
): { start: DateTime; end?: DateTime; confirmed: boolean } {
  // Multiple sessions joined by '&' are not a single confirmed start.
  if (/\bTBD\b|\bTBA\b|\bnoon\b|\bmidnight\b|&/.test(value))
    return { start: day, confirmed: false };
  const normalized = value
    .replace(/a\.?m\.?/gi, "AM")
    .replace(/p\.?m\.?/gi, "PM");
  const m = normalized.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i,
  );
  const make = (h: string, min: string | undefined, ap: string) =>
    Number(h) >= 1 && Number(h) <= 12 && Number(min || 0) < 60
      ? day.set({
          hour: (Number(h) % 12) + (/p/i.test(ap) ? 12 : 0),
          minute: Number(min || 0),
        })
      : undefined;
  if (m) {
    const start = make(m[1], m[2], m[3] || m[6]),
      end = make(m[4], m[5], m[6]);
    if (start && end && end > start) return { start, end, confirmed: true };
    return { start: day, confirmed: false };
  }
  const singles = [
    ...normalized.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/gi),
  ];
  if (singles.length === 1) {
    const m = singles[0],
      start = make(m[1], m[2], m[3]);
    if (start) return { start, confirmed: true };
  }
  return { start: day, confirmed: false };
}

/** Deterministic parsing for verified VT prose layouts. Backend-only pure function:
 * no network, model, writes, credentials, retries or transaction. Missing/ambiguous
 * dates, years or locations produce no event. Only explicit section years apply;
 * the fetch clock and article publication metadata never supply event years. */
export function parsePublicProse(
  html: string,
  url: string,
  source: PublicSourceDefinition,
  now = new Date(),
): { events: CampusEvent[]; deadlines: CampusDeadline[] } {
  const $ = load(html),
    main = $("main").first(),
    events: CampusEvent[] = [],
    deadlines: CampusDeadline[] = [];
  main
    .find("nav,footer,script,style,header,.vt-article-date,.vt-date")
    .remove();
  const hostname = new URL(url).hostname,
    checkedAt = now.toISOString();
  const ref = (id: string) => ({
    source: "vt-events" as const,
    providerId: source.id,
    label: source.label,
    sourceId: `${source.id}:${id}`,
    url,
    fetchedAt: checkedAt,
  });
  const media = (fragment: string): EventMedia[] => {
    const content = load(fragment),
      values: EventMedia[] = [];
    content("img").each((_, img) => {
      const image = content(img),
        href = safe(image.attr("src"), url);
      if (href && !values.some((x) => x.url === href))
        values.push({
          url: href,
          kind: "image",
          alt: image.attr("alt"),
          sourceUrl: url,
        });
    });
    return values.slice(0, 15);
  };
  const add = (
    title: string,
    day: DateTime | undefined,
    time: string,
    location: string,
    description: string,
    fragment: string,
    key = title,
  ) => {
    if (
      !title ||
      !day ||
      !location ||
      /^(?:TBD|TBA)$/i.test(location) ||
      /tentative/i.test(time)
    )
      return;
    const parsed = clock(time, day),
      node = load(fragment),
      links: NonNullable<CampusEvent["links"]> = [
        { label: "Official event details", url, kind: "source" },
      ];
    node("a[href]").each((_, a) => {
      const href = safe(node(a).attr("href"), url),
        label = clean(node(a).text());
      if (href && label && !links.some((x) => x.url === href))
        links.push({
          label,
          url: href,
          kind: /register|ticket|sign up/i.test(label) ? "tickets" : "other",
        });
    });
    const isOnline = /\b(?:zoom|online|webinar)\b/i.test(location);
    const onlineUrl = links.find((l) =>
      /zoom\.us\/|teams\.microsoft\.com\//.test(l.url),
    )?.url;
    const physical = location
      .replace(
        /\s*(?:and\s+)?(?:register for |webinar registration - )?zoom(?: webinar)?|online-only/gi,
        "",
      )
      .trim();
    const id = hash(`${url}|${key}`),
      images = media(fragment);
    events.push({
      id: `${source.id}-${id}`,
      title,
      description: description.slice(0, 12000),
      start: parsed.start.toUTC().toISO()!,
      end: parsed.end?.toUTC().toISO() || null,
      timezone: ZONE,
      location: physical || null,
      isOnline,
      ...(onlineUrl ? { onlineUrl } : {}),
      organizer: source.label,
      categories: hostname === "artscenter.vt.edu" ? ["Arts & music"] : [],
      sources: [ref(id)],
      updatedAt: checkedAt,
      status: "scheduled",
      mode: "live",
      timeTBD: !parsed.confirmed,
      allDay: false,
      endEstimated: false,
      visibility: { kind: "public" },
      timeDetails: {
        precision: !parsed.confirmed
          ? "date_only"
          : parsed.end
            ? "confirmed"
            : "start_only",
        startDate: day.toISODate()!,
        confirmedStart: parsed.confirmed ? parsed.start.toUTC().toISO() : null,
        confirmedEnd: parsed.end?.toUTC().toISO() || null,
      },
      links,
      media: images,
      registrationUrl: links.find((l) => l.kind === "tickets")?.url,
    });
  };
  if (hostname === "international.vt.edu") {
    let year: number | undefined;
    main.find("h2,li").each((_, el) => {
      const node = $(el),
        line = clean(node.text());
      if (el.tagName === "h2") {
        const m = line.match(
          /(?:Fall|Spring|Summer)\s+(20\d{2})\s+Cranwell Events/i,
        );
        year = m ? Number(m[1]) : undefined;
        return;
      }
      if (
        !year ||
        !line.includes("|") ||
        /tentative|no classes|offices closed|last day of classes|break/i.test(
          line,
        )
      )
        return;
      const [prefix, ...titles] = line.split("|"),
        title = titles.join("|").trim();
      // Date ranges/repeat sessions are not silently flattened into a single event.
      if (/^\d+\s*(?:-|–|and)\s*\d+/.test(prefix)) return;
      const parts = prefix.split(",").map(clean),
        day = date(parts[0], year);
      const timed =
        parts.length >= 3 && /\d.*[ap]\.?m|^(?:TBD|TBA)$/i.test(parts[1]);
      const location = parts.slice(timed ? 2 : 1).join(", ");
      add(
        title,
        day,
        timed ? parts[1] : "",
        location,
        line,
        $.html(node),
        `${year}|${parts[0]}|${title}`,
      );
    });
  } else if (
    hostname === "artscenter.vt.edu" &&
    /\/(performances|exhibitions|experiences)\/.+\.html/.test(
      new URL(url).pathname,
    )
  ) {
    const title = clean(main.find("h1").first().text());
    const p = main
      .find(".vt-text p")
      .filter((_, el) => {
        const line = clean($(el).text());
        return !!date(line) && /\b\d{1,2}(?::\d{2})?\s*[AP]M\b/i.test(line);
      })
      .first();
    const line = clean(p.text()),
      venue = clean(p.next("p").text());
    if (/hall|theatre|theater|gallery|galleries|studio|room/i.test(venue)) {
      const intro = main.find(".vt-text").slice(0, 12),
        description = intro
          .toArray()
          .map((x) => clean($(x).text()))
          .filter((x) => !/^\w+ \d+, 20\d{2}$/.test(x))
          .join("\n");
      add(
        title,
        date(line),
        line,
        venue,
        description,
        intro
          .toArray()
          .map((x) => $.html(x))
          .join(""),
        url,
      );
      const event = events[0];
      if (event) {
        const og = safe($('meta[property="og:image"]').attr("content"), url);
        if (og)
          event.media = [
            { url: og, kind: "image", alt: title, sourceUrl: url },
          ];
        const prices = description.split("\n").find((x) => /\$\d+/.test(x));
        if (prices) event.admission = { price: prices, currency: "USD" };
      }
    }
  } else if (
    /^(?:www\.)?research\.vt\.edu$/.test(hostname) &&
    /\/events\/.+\.html/.test(new URL(url).pathname)
  ) {
    const paragraphs = main.find(".vt-text p").toArray(),
      body = paragraphs.map((x) => clean($(x).text())).join("\n");
    const years = [
      ...new Set(
        [
          ...body.matchAll(/\b(?:fall|spring|summer|winter)\s+(20\d{2})\b/gi),
        ].map((x) => x[1]),
      ),
    ];
    const year = years.length === 1 ? Number(years[0]) : undefined;
    const block = main
      .find(".vt-text")
      .filter((_, el) => /ONLINE-ONLY/i.test($(el).text()))
      .first();
    if (block.length) {
      const line = block
        .find("p")
        .toArray()
        .map((x) => clean($(x).text()))
        .find((x) => !!date(x, year));
      if (line)
        add(
          clean(main.find("h1").first().text()),
          date(line, year),
          line,
          "ONLINE-ONLY",
          body,
          $.html(block),
          url,
        );
    }
  } else if (/^(?:www\.)?recsports\.vt\.edu$/.test(hostname)) {
    let title = "",
      parts: string[] = [],
      fragment: string[] = [];
    const flush = () => {
      const line = parts.find((x) => !!date(x));
      if (!line) return;
      const card = main
        .find("h2")
        .filter((_, el) => clean($(el).text()) === title)
        .first()
        .closest(".vt-col");
      const ownedFragment =
        card.length && card.find("h2").length === 1
          ? $.html(card)
          : fragment.join("");
      const body = parts.join("\n"),
        location = body.match(
          /\b(?:Drillfield|Lancerlot Ice Complex|Upper Quad|War Memorial Hall|McComas Hall)\b/i,
        )?.[0];
      if (location)
        add(title, date(line), line, location, body, ownedFragment, title);
    };
    main.find("h2,h3,p,a,img").each((_, el) => {
      const node = $(el);
      if (el.tagName === "h2") {
        flush();
        title = clean(node.text());
        parts = [];
        fragment = [];
      } else {
        parts.push(clean(node.text()));
        fragment.push($.html(node));
      }
    });
    flush();
  } else if (hostname === "housing.vt.edu") {
    let heading = "";
    main.find("h4,li").each((_, el) => {
      const node = $(el),
        line = clean(node.clone().children("ul,ol").remove().end().text());
      if (el.tagName === "h4") {
        heading = line;
        return;
      }
      if (
        !heading ||
        !/deadline|must.*(?:signed by|moved out|depart)|no later than|closes at|close for.*at|must.*check out/i.test(
          line,
        )
      )
        return;
      // Mixed opening/closing dates require the closing clause, not the first date.
      const clauses = line.split(/(?<=\.)\s+(?=[A-Z])/),
        clause = clauses.find((x) =>
          /deadline|closes at|close for.*at|no later than|must.*(?:signed by|moved out|depart|check out)/i.test(
            x,
          ),
        );
      if (!clause) return;
      const d = date(clause);
      if (!d) return;
      const t = clock(clause, d),
        id = hash(
          `${url}|${heading}|${clause.replace(/20\d{2}|\d{1,2}/g, "")}`,
        );
      deadlines.push({
        id: `deadline-${source.id}-${id}`,
        title: heading,
        description: clause,
        dueDate: d.toISODate()!,
        ...(t.confirmed ? { dueAt: t.start.toUTC().toISO()! } : {}),
        timezone: ZONE,
        sources: [ref(id)],
        updatedAt: checkedAt,
        status: "active",
      });
    });
  }
  return {
    events: [...new Map(events.map((x) => [x.id, x])).values()],
    deadlines: [...new Map(deadlines.map((x) => [x.id, x])).values()],
  };
}
