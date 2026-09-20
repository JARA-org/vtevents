import { createHash } from "node:crypto";
import type {
  CampusEvent,
  FieldEvidence,
  Json,
} from "../../../packages/shared/src/contracts.js";

const normalized = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const sourceKeys = (event: CampusEvent) =>
  event.sources.map((s) => `${s.source}:${s.sourceId}`);
const sameScope = (a: CampusEvent, b: CampusEvent) =>
  JSON.stringify(a.visibility || { kind: "public" }) ===
  JSON.stringify(b.visibility || { kind: "public" });
const nativeMatch = (a: CampusEvent, b: CampusEvent) =>
  sourceKeys(a).some((key) => sourceKeys(b).includes(key));
const discord = (event: CampusEvent) =>
  event.sources.some((s) => s.source === "discord");
function localDate(event: CampusEvent): string {
  if (event.timeDetails?.startDate) return event.timeDetails.startDate;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: event.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(event.start));
  } catch {
    return event.start.slice(0, 10);
  }
}
function eventUrls(event: CampusEvent): string[] {
  return [
    ...event.sources.map((s) => s.url),
    ...(event.links || []).filter((l) => l.kind === "source").map((l) => l.url),
  ].flatMap((value) => {
    try {
      const url = new URL(value);
      // Feed/home/category URLs identify a collection, never an occurrence.
      if (
        !/^https?:$/.test(url.protocol) ||
        /\.(ics|xml|rss)$/i.test(url.pathname)
      )
        return [];
      if (!url.search && url.pathname.split("/").filter(Boolean).length < 2)
        return [];
      if (
        /\/(?:calendar|events|schedule|schedules|feed)\/?$/i.test(
          url.pathname,
        ) &&
        !url.searchParams.has("id") &&
        !url.searchParams.has("eventId")
      )
        return [];
      url.hash = "";
      for (const key of [...url.searchParams.keys()])
        if (/^utm_|^fbclid$/.test(key)) url.searchParams.delete(key);
      url.searchParams.sort();
      return [url.href.replace(/\/$/, "")];
    } catch {
      return [];
    }
  });
}
function compatible(a: CampusEvent, b: CampusEvent): boolean {
  if (!sameScope(a, b) || (a.clubId && b.clubId && a.clubId !== b.clubId))
    return false;
  if (nativeMatch(a, b)) return true;
  if (localDate(a) !== localDate(b)) return false;
  if (
    a.sports &&
    b.sports &&
    (normalized(a.sports.sport) !== normalized(b.sports.sport) ||
      normalized(a.sports.opponent) !== normalized(b.sports.opponent))
  )
    return false;
  if (eventUrls(a).some((url) => eventUrls(b).includes(url))) return true;
  if (a.timeTBD || b.timeTBD || a.allDay || b.allDay) return false;
  return (
    normalized(a.title) !== "" &&
    normalized(a.title) === normalized(b.title) &&
    Date.parse(a.start) === Date.parse(b.start) &&
    normalized(a.location) !== "" &&
    normalized(a.location) === normalized(b.location)
  );
}
const unique = <T>(items: T[], key: (item: T) => string): T[] => [
  ...new Map(items.map((item) => [key(item), item])).values(),
];
function evidence(
  event: CampusEvent,
  field: string,
  value: Json,
): FieldEvidence {
  const existing = event.evidence?.find(
    (e) =>
      e.field === field && JSON.stringify(e.value) === JSON.stringify(value),
  );
  if (existing) return existing;
  const source = event.sources[0];
  return {
    field,
    value,
    citation: {
      sourceId: source?.sourceId || event.id,
      url: source?.url || "",
    },
    observedAt: source?.fetchedAt || event.updatedAt,
    sourceUpdatedAt: source?.sourceUpdatedAt || null,
    method: "structured",
  };
}
function merge(a: CampusEvent, b: CampusEvent): CampusEvent {
  if (b.ownerCorrected && !a.ownerCorrected) return merge(b, a);
  const out: CampusEvent = {
    ...a,
    sources: unique(
      [...a.sources, ...b.sources],
      (s) => `${s.source}:${s.sourceId}`,
    ),
    categories: unique([...a.categories, ...b.categories], (x) => x),
  };
  out.aliases = unique(
    [a.id, b.id, ...(a.aliases || []), ...(b.aliases || [])],
    (x) => x,
  );
  out.links = unique(
    [...(a.links || []), ...(b.links || [])],
    (link) => `${link.kind}:${link.url}`,
  );
  out.evidence = unique([...(a.evidence || []), ...(b.evidence || [])], (e) =>
    JSON.stringify(e),
  );
  out.conflicts = unique(
    [...(a.conflicts || []), ...(b.conflicts || [])],
    (e) => JSON.stringify(e),
  );
  out.media = unique(
    [...(a.media || []), ...(b.media || [])],
    (media) => `${media.kind}:${media.url}`,
  );
  out.sports =
    a.sports && b.sports ? { ...b.sports, ...a.sports } : a.sports || b.sports;
  out.extensions = { ...b.extensions, ...a.extensions };
  out.audience = unique(
    [...(a.audience || []), ...(b.audience || [])],
    (x) => x,
  );
  out.admission = a.admission || b.admission;
  if (
    a.admission &&
    b.admission &&
    JSON.stringify(a.admission) !== JSON.stringify(b.admission)
  ) {
    out.conflicts.push({
      field: "admission",
      alternatives: [
        evidence(a, "admission", a.admission),
        evidence(b, "admission", b.admission),
      ],
      resolution: "unresolved",
      reason: "Admission claims differ; original values preserved.",
    });
  }
  for (const field of [
    "title",
    "description",
    "start",
    "end",
    "location",
    "onlineUrl",
    "organizer",
    "status",
    "address",
    "registrationUrl",
    "organizerUrl",
  ] as const) {
    const av = a[field],
      bv = b[field];
    const ownerField =
      a.ownerCorrected &&
      ["title", "description", "start", "location", "onlineUrl"].includes(
        field,
      );
    if (
      !ownerField &&
      (av === null || av === undefined || av === "") &&
      bv !== undefined &&
      bv !== null &&
      bv !== ""
    ) {
      Object.assign(out, { [field]: bv });
    } else if (
      (ownerField || (av != null && av !== "")) &&
      bv != null &&
      bv !== "" &&
      av !== bv
    ) {
      // Complementary descriptions are retained as independent evidence, not
      // concatenated into an invented authoritative account.
      const alternatives = [
        evidence(a, field, av ?? null),
        evidence(b, field, bv),
      ];
      out.conflicts.push({
        field,
        alternatives,
        resolution: ownerField ? "reviewed" : "unresolved",
        reason: ownerField
          ? "Authenticated club owner correction retained; source alternative preserved."
          : "Sources disagree; retained for review. Fetch time is not authority.",
      });
      out.evidence.push(...alternatives);
      if (field === "status" && bv === "cancelled") out.status = "cancelled";
    }
  }
  if (a.isOnline === undefined) out.isOnline = b.isOnline;
  else if (b.isOnline !== undefined && a.isOnline !== b.isOnline)
    out.conflicts.push({
      field: "isOnline",
      alternatives: [
        evidence(a, "isOnline", a.isOnline),
        evidence(b, "isOnline", b.isOnline),
      ],
      resolution: a.ownerCorrected ? "reviewed" : "unresolved",
      reason: "Attendance claims disagree; original evidence retained.",
    });
  if (a.sports && b.sports && out.sports) {
    for (const field of [
      "sport",
      "opponent",
      "venueType",
      "state",
      "homeScore",
      "awayScore",
      "period",
      "clock",
      "opponentLogoUrl",
    ] as const) {
      const av = a.sports[field],
        bv = b.sports[field];
      if ((av == null || av === "" || av === "unknown") && bv != null)
        Object.assign(out.sports, { [field]: bv });
      else if (av != null && bv != null && bv !== "unknown" && av !== bv) {
        const name = `sports.${field}`;
        out.conflicts.push({
          field: name,
          alternatives: [evidence(a, name, av), evidence(b, name, bv)],
          resolution: "unresolved",
          reason:
            "Sports source claims disagree; neither fetch time nor source order establishes authority.",
        });
      }
    }
  }
  out.conflicts = unique(out.conflicts, (x) => JSON.stringify(x));
  out.evidence = unique(out.evidence, (x) => JSON.stringify(x));
  return out;
}

/** Backend-only pure reconciliation of validated, scoped event DTOs. Returns new
 * canonical projections; no network, AI, database writes, authorization grants,
 * or transactions. Caller must authorize the input scope. Same-source revisions
 * replace old claims; cross-source conflicts remain explicit. Previous records
 * supply IDs only, never withdrawn content. Deterministic retries are safe.
 */
export function consolidateEvents(
  raw: CampusEvent[],
  previous: CampusEvent[] = [],
): CampusEvent[] {
  const revisions: CampusEvent[] = [];
  for (const item of raw) {
    const index = revisions.findIndex(
      (old) => sameScope(old, item) && nativeMatch(old, item),
    );
    if (index < 0) revisions.push(structuredClone(item));
    else {
      const old = revisions[index];
      const revisionTime = (event: CampusEvent) =>
        Math.max(
          ...event.sources
            .map((s) => Date.parse(s.sourceUpdatedAt || event.updatedAt))
            .filter(Number.isFinite),
          0,
        );
      if (revisionTime(item) > revisionTime(old))
        revisions[index] = structuredClone({
          ...item,
          // Legacy optional attendance fields may be omitted by older adapters.
          // Absence means unknown, while explicit null/false still withdraws a value.
          ...(item.onlineUrl===undefined && old.onlineUrl!==undefined ? {onlineUrl:old.onlineUrl} : {}),
          ...(item.isOnline===undefined && old.isOnline!==undefined ? {isOnline:old.isOnline} : {}),
        });
    }
  }
  const groups: CampusEvent[][] = [];
  for (const event of revisions) {
    // Complete-link grouping prevents A~B~C chains from merging A with an
    // incompatible C (for example, two different venues/occurrences).
    const group = groups.find((items) =>
      items.every((item) => compatible(item, event)),
    );
    if (group) group.push(event);
    else groups.push([event]);
  }
  const used = new Set<string>();
  return groups.map((group) => {
    const event = group.slice(1).reduce(merge, group[0]);
    const old = previous.find(
      (candidate) =>
        sameScope(candidate, event) &&
        nativeMatch(candidate, event) &&
        !used.has(candidate.id),
    );
    let id =
      event.ownerCorrected && discord(event) ? event.id : old?.id || event.id;
    if (used.has(id))
      id = `${event.id}-${createHash("sha256")
        .update(sourceKeys(event).sort().join("|") + event.start + event.title)
        .digest("hex")
        .slice(0, 12)}`;
    while (used.has(id)) id += "-2";
    used.add(id);
    return {
      ...event,
      id,
      aliases: unique(
        [...(event.aliases || []), event.id, ...(old ? [old.id] : [])],
        (x) => x,
      ).filter((alias) => alias !== id),
    };
  });
}
