import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { CampusEvent, PublicSourceDefinition } from "../../../packages/shared/src/contracts.js";

/** Exact public sheet referenced by https://www.research.vt.edu/events.html; not arbitrary Google URLs. */
export const RESEARCH_SHEET_URL = "https://docs.google.com/spreadsheets/d/1Znk-WzOSNs42Km7bx1_-GVgLEzTVqH-GK615AaYjkzA/gviz/tq?tqx=out:json&gid=0";
const zone = "America/New_York";
type Cell = { v?: unknown; f?: unknown } | null;

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return;
    return parsed.href;
  } catch { return; }
}

function dateCell(cell: Cell): DateTime | undefined {
  if (typeof cell?.v !== "string") return;
  const match = cell.v.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if (!match) return;
  const year = Number(match[1]), month = Number(match[2]) + 1, day = Number(match[3]);
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return;
  const parsed = DateTime.fromObject({ year, month, day }, { zone });
  return parsed.isValid && parsed.year === year && parsed.month === month && parsed.day === day ? parsed : undefined;
}

function clockCell(cell: Cell, day: DateTime): DateTime | undefined {
  const raw = typeof cell?.f === "string" ? cell.f : typeof cell?.v === "string" ? cell.v : "";
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/i);
  if (!match) return;
  const hour12 = Number(match[1]), minute = Number(match[2] || 0);
  if (hour12 < 1 || hour12 > 12 || minute > 59) return;
  const hour = hour12 % 12 + (/^p/i.test(match[3]) ? 12 : 0);
  const instant = day.set({ hour, minute });
  // DST gaps/overlaps are not confirmed times.
  return instant.hour === hour && instant.minute === minute && instant.getPossibleOffsets().length === 1 ? instant : undefined;
}

/** Pure parser for the operator-pinned public Research sheet. JSON is extracted from one exact
 * Visualization callback wrapper without execution. Reads no network/database, spends no AI and
 * performs no mutations. Returns only qualified public rows and allowlisted detail discovery links.
 * Missing venues/time evidence never become fabricated facts. Throws on wrong URL, malformed wrapper,
 * schema changes or oversized input; callers preserve their previous snapshot on failure. Retry-safe.
 * Row occurrence IDs use explicit link/title/date because the provider supplies no native event ID. */
export function parseResearchSheet(body: string, url: string, source: PublicSourceDefinition, now = DateTime.now()): { events: CampusEvent[]; deadlines: []; links: string[] } {
  if (url !== RESEARCH_SHEET_URL || body.length > 2_000_000) throw new Error("Unapproved research sheet payload");
  const match = body.match(/^\s*(?:\/\*O_o\*\/\s*)?google\.visualization\.Query\.setResponse\((\{[\s\S]*\})\);?\s*$/);
  if (!match) throw new Error("Invalid research sheet wrapper");
  const payload = JSON.parse(match[1]);
  const table = payload?.table;
  if (payload?.status !== "ok" || !Array.isArray(table?.cols) || !Array.isArray(table?.rows) || table.rows.length > 10000) throw new Error("Invalid research sheet table");
  const labels = ["Event Name", "Event Date", "Start Time", "End Time", "Short Description", "LINK", "College"];
  if (labels.some((label, index) => table.cols[index]?.label !== label) || !/^Zoom Link\b/.test(table.cols[7]?.label || "") || table.cols[8]?.label !== "Remove date if applicable") throw new Error("Research sheet columns changed");
  const events: CampusEvent[] = [], links = new Set<string>();
  const checkedAt = now.toUTC().toISO();
  if (!checkedAt) throw new Error("Invalid research sheet observation time");
  for (const row of table.rows) {
    if (!Array.isArray(row?.c)) throw new Error("Invalid research sheet row");
    const cells: Cell[] = row.c;
    if (cells.some((cell) => cell !== null && (typeof cell !== "object" || Array.isArray(cell)))) throw new Error("Invalid research sheet cell");
    const webLink = safeUrl(cells[5]?.v), onlineLink = safeUrl(cells[7]?.v);
    if (webLink && source.allowedHosts.includes(new URL(webLink).hostname)) {
      const link = new URL(webLink); link.hash = "";
      if (links.size < 500) links.add(link.href);
    }
    const day = dateCell(cells[1]), removed = dateCell(cells[8]);
    if (removed && removed.toISODate()! <= now.setZone(zone).toISODate()!) continue;
    const title = typeof cells[0]?.v === "string" ? cells[0].v.trim() : "";
    const description = typeof cells[4]?.v === "string" ? cells[4].v.trim().slice(0, 12000) : "";
    if (!day || !title || title.length > 300) continue;
    const venue = description.match(/(?:^|\n)\s*(?:Location|Venue|Where)\s*:\s*([^\n]{3,200})(?:\n|$)/i)?.[1]?.trim();
    const physical = venue && !/^(?:tbd|tba|online|virtual|zoom|sign in|log in|https?:)/i.test(venue) ? venue : undefined;
    // Column H explicitly means the sole event link when there is no event detail page.
    const online = !webLink ? onlineLink : undefined;
    if (!physical && !online) continue;
    const start = clockCell(cells[2], day), end = clockCell(cells[3], day);
    if (start && end && end <= start) continue;
    const identity = `${source.id}|${webLink || online || ""}|${title}|${day.toISODate()}`;
    const native = createHash("sha256").update(identity).digest("hex").slice(0, 24);
    const sourceId = `research-sheet:${native}`;
    const reference = { source: source.source, sourceId, url, providerId: source.id, label: source.label, fetchedAt: checkedAt };
    const organizer = typeof cells[6]?.v === "string" ? cells[6].v.trim().replace(/^"|"$/g, "").slice(0, 300) : null;
    events.push({
      id: `event-${source.id}-${native}`, title, description, start: (start || day).toUTC().toISO()!, end: start && end ? end.toUTC().toISO() : null,
      timezone: zone, location: physical || null, ...(online ? { onlineUrl: online, isOnline: true } : {}), organizer,
      categories: ["Tech & science"], sources: [reference], updatedAt: checkedAt, status: "scheduled", mode: "live", timeTBD: !start, allDay: false, endEstimated: false,
      visibility: { kind: "public" }, timeDetails: { precision: start && end ? "confirmed" : start ? "start_only" : "date_only", startDate: day.toISODate()!, confirmedStart: start?.toUTC().toISO() || null, confirmedEnd: start && end ? end.toUTC().toISO() : null },
      ...(webLink ? { links: [{ label: "Research event details", url: webLink, kind: "source" }] } : {}),
      evidence: [{ field: "start", value: (start || day).toUTC().toISO()!, citation: { sourceId, url, excerpt: `Date: ${String(cells[1]?.v)}; time: ${String(cells[2]?.f || cells[2]?.v || "not supplied")}` }, observedAt: checkedAt, sourceUpdatedAt: null, method: "structured" },
        { field: physical ? "location" : "onlineUrl", value: physical || online!, citation: { sourceId, url, excerpt: physical ? `Location: ${physical}` : `Sole event link: ${online}` }, observedAt: checkedAt, sourceUpdatedAt: null, method: "structured" }],
    });
  }
  return { events: [...new Map(events.map((event) => [event.id, event])).values()], deadlines: [], links: [...links] };
}
