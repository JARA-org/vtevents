import { createHash } from "node:crypto";
import type { Document, AnyBulkWriteOperation } from "mongodb";
import type {
  CampusEvent,
  CampusDeadline,
  ClubHistoryEntry,
  ClubHistoryView,
  PublicClubMemory,
} from "../../../packages/shared/src/contracts.js";
import { database, mongoClient } from "./store.js";

const eventFields = [
  "id",
  "title",
  "description",
  "start",
  "end",
  "timezone",
  "location",
  "onlineUrl",
  "isOnline",
  "organizer",
  "categories",
  "sources",
  "updatedAt",
  "status",
  "mode",
  "timeTBD",
  "allDay",
  "endEstimated",
  "clubId",
  "sports",
  "links",
  "evidence",
  "conflicts",
  "visibility",
  "timeDetails",
  "media",
  "admission",
  "audience",
  "address",
  "registrationUrl",
  "organizerUrl",
  "ownerCorrected",
  "aliases",
];
const deadlineFields = [
  "id",
  "title",
  "description",
  "dueDate",
  "dueAt",
  "timezone",
  "audience",
  "term",
  "submissionUrl",
  "sources",
  "updatedAt",
  "status",
  "media",
];
const volatileFields = new Set([
  "fetchedAt",
  "updatedAt",
  "checkedAt",
  "observedAt",
  "revision",
  "stale",
]);
const prohibitedFields =
  /^(extensions|userId|ownerId|accessToken|refreshToken|token|secret|password|apiKey|credentials)$/i;
// DTO projection, not a claim that filtering secret-looking names can classify private data.
// Unknown properties inside known nested structures must not enter historical storage.
const nestedFields: Record<string, readonly string[]> = {
  sources: [
    "source",
    "sourceId",
    "url",
    "fetchedAt",
    "sourceUpdatedAt",
    "evidenceId",
    "providerId",
    "label",
  ],
  media: ["url", "kind", "alt", "credit", "sourceUrl"],
  admission: ["price", "currency", "free", "availability"],
  sports: [
    "sport",
    "opponent",
    "venueType",
    "state",
    "homeScore",
    "awayScore",
    "period",
    "clock",
    "opponentLogoUrl",
    "checkedAt",
  ],
  links: ["label", "url", "kind", "embeddable"],
  evidence: [
    "id",
    "field",
    "value",
    "citation",
    "observedAt",
    "sourceUpdatedAt",
    "method",
  ],
  alternatives: [
    "id",
    "field",
    "value",
    "citation",
    "observedAt",
    "sourceUpdatedAt",
    "method",
  ],
  citation: ["sourceId", "url", "excerpt"],
  conflicts: [
    "field",
    "alternatives",
    "resolution",
    "selectedEvidenceId",
    "reason",
  ],
  visibility: ["kind"],
  timeDetails: [
    "precision",
    "startDate",
    "endDate",
    "note",
    "confirmedStart",
    "confirmedEnd",
  ],
};

function projectNested(value: unknown, context: string): unknown {
  if (Array.isArray(value))
    return value.map((item) => projectNested(item, context));
  if (value && typeof value === "object") {
    const allowed = nestedFields[context];
    // Evidence.value is intentionally JSON per contract. It must already be public, validated evidence;
    // no name-based filter can make an arbitrary private value safe to publish.
    if (!allowed && context !== "value")
      throw new Error("Unexpected object in public memory DTO");
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !prohibitedFields.test(key) && (!allowed || allowed.includes(key)),
        )
        .map(([key, item]) => [
          key,
          context === "value" ? clean(item) : projectNested(item, key),
        ]),
    );
  }
  return value;
}

function clean(value: unknown, semantic = false): unknown {
  if (Array.isArray(value)) return value.map((item) => clean(item, semantic));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, item]) =>
            item !== undefined &&
            !prohibitedFields.test(key) &&
            !(semantic && volatileFields.has(key)),
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, clean(item, semantic)]),
    );
  return value;
}

/** Pure content identity for validated public DTOs; no effects. Ignores observation/fetch timestamps,
 * retains explicit provider update times and cancellations. Never an ownership or authorization check. */
export function publicMemoryRevision(
  value: CampusEvent | CampusDeadline,
): string {
  return createHash("sha256")
    .update(JSON.stringify(clean(value, true)))
    .digest("hex");
}

function publicRecord<T extends CampusEvent | CampusDeadline>(
  input: T,
  fields: string[],
): T {
  const visibility = (input as CampusEvent).visibility;
  if (visibility && visibility.kind !== "public")
    throw new Error("Public memory rejects private context");
  if (
    !input.id ||
    !input.title ||
    !input.sources.length ||
    input.sources.some(
      (source) =>
        !["vt-events", "vt-sports", "gobblerconnect", "discord"].includes(
          source.source,
        ),
    )
  )
    throw new Error("Public memory requires public source provenance");
  const object = input as unknown as Record<string, unknown>;
  return clean(
    Object.fromEntries(
      fields
        .filter((field) => object[field] !== undefined)
        .map((field) => [field, projectNested(object[field], field)]),
    ),
  ) as T;
}

/** Pure organizer evidence, not a claim/mission/member inference. Managed IDs remain unverified here.
 * Same names from different provider origins do not establish a shared identity. */
export function publicOrganizerMemory(
  event: CampusEvent,
  now: string,
): PublicClubMemory | null {
  publicRecord(event, eventFields);
  const name = event.organizer?.trim();
  if (!name) return null;
  const sourceUrls = [
    ...new Set(
      event.sources
        .map((source) => source.url)
        .filter((url) => {
          try {
            const parsed = new URL(url);
            return (
              ["https:", "http:"].includes(parsed.protocol) &&
              !parsed.username &&
              !parsed.password
            );
          } catch {
            return false;
          }
        }),
    ),
  ];
  const origin = sourceUrls[0]
    ? new URL(sourceUrls[0]).origin
    : event.sources[0].source;
  const identity = event.clubId
    ? `managed:${event.clubId}`
    : `observed:${origin}:${event.organizerUrl || ""}:${name.toLowerCase()}`;
  return {
    id: `public-organizer:${createHash("sha256").update(identity).digest("hex")}`,
    name,
    ...(event.clubId ? { clubId: event.clubId } : {}),
    sourceUrls,
    eventIds: [event.id],
    firstSeenAt: now,
    lastSeenAt: now,
    description:
      "Organizer named in publicly sourced event history. Ownership and membership are not verified.",
    verified: false,
  };
}

/** Trusted ingestion only: accepts already reconciled public snapshots; validates the complete batch
 * before any write. Atomically upserts immutable content revisions, current heads and observed organizer
 * history in one Mongo transaction. No AI/provider calls. Omitted records remain historical; explicit
 * cancellation/withdrawal statuses are stored. An unchanged content hash causes no writes, including
 * observation timestamps and organizer history. Retries are idempotent by kind/id/content hash.
 * Throws for private/ungrounded inputs, unavailable Mongo or transaction failure. */
export async function recordPublicMemory(
  events: CampusEvent[],
  deadlines: CampusDeadline[],
): Promise<void> {
  const items = [
    ...events.map((event) => ({
      kind: "event",
      value: publicRecord(event, eventFields),
    })),
    ...deadlines.map((deadline) => ({
      kind: "deadline",
      value: publicRecord(deadline, deadlineFields),
    })),
  ];
  if (!items.length) return;
  const db = database();
  if (!mongoClient) throw new Error("Public memory database is unavailable");
  const session = mongoClient.startSession();
  const now = new Date().toISOString();
  try {
    await session.withTransaction(async () => {
      type Row = Document & { _id: string };
      const heads = db.collection<Row>("public_memory_heads");
      // One indexed read and at most three bulk writes per bounded coordinator
      // batch, instead of four network round trips for every event. Keep all
      // collections in the same transaction and ordered per-record semantics.
      const current = new Map(
        (
          await heads
            .find(
              {
                _id: {
                  $in: items.map(({ kind, value }) => `${kind}:${value.id}`),
                },
              },
              { projection: { revision: 1 }, session },
            )
            .toArray()
        ).map((row) => [row._id, row.revision]),
      );
      const revisionWrites: AnyBulkWriteOperation<Row>[] = [];
      const headWrites: AnyBulkWriteOperation<Row>[] = [];
      const clubWrites: AnyBulkWriteOperation<Row>[] = [];
      for (const { kind, value } of items) {
        const headId = `${kind}:${value.id}`,
          revision = publicMemoryRevision(value);
        if (current.get(headId) === revision) continue;
        current.set(headId, revision);
        revisionWrites.push({
          updateOne: {
            filter: { _id: `${headId}:${revision}` },
            update: {
              $setOnInsert: {
                kind,
                recordId: value.id,
                revision,
                value,
                recordedAt: now,
              },
            },
            upsert: true,
          },
        });
        headWrites.push({
          updateOne: {
            filter: { _id: headId },
            update: {
              $set: { kind, revision, value, lastSeenAt: now },
              $setOnInsert: { firstSeenAt: now },
            },
            upsert: true,
          },
        });
        if (kind === "event") {
          const club = publicOrganizerMemory(value as CampusEvent, now);
          if (club)
            clubWrites.push({
              updateOne: {
                filter: { _id: club.id },
                update: {
                  $set: {
                    name: club.name,
                    description: club.description,
                    verified: false,
                    lastSeenAt: now,
                    ...(club.clubId ? { clubId: club.clubId } : {}),
                  },
                  $setOnInsert: { id: club.id, firstSeenAt: now },
                  $addToSet: {
                    eventIds: { $each: club.eventIds },
                    sourceUrls: { $each: club.sourceUrls },
                  },
                },
                upsert: true,
              },
            });
        }
      }
      if (revisionWrites.length)
        await db
          .collection<Row>("public_memory_revisions")
          .bulkWrite(revisionWrites, { session, ordered: true });
      if (headWrites.length)
        await heads.bulkWrite(headWrites, { session, ordered: true });
      if (clubWrites.length)
        await db
          .collection<Row>("public_memory_clubs")
          .bulkWrite(clubWrites, { session, ordered: true });
    });
  } finally {
    await session.endSession();
  }
}

/** Explicit public-data withdrawal/exclusion only, called by trusted ingestion on deletion or opt-out.
 * Atomically removes current AND historical copies and organizer associations. Missing IDs succeed;
 * retries are idempotent. Does not infer withdrawal from omission; no provider/AI calls. */
export async function withdrawPublicMemory(eventIds: string[]): Promise<void> {
  if (!eventIds.length) return;
  if (
    eventIds.length > 1000 ||
    eventIds.some((id) => typeof id !== "string" || !id)
  )
    throw new Error("Invalid withdrawal IDs");
  const db = database();
  if (!mongoClient) throw new Error("Public memory database is unavailable");
  const session = mongoClient.startSession();
  try {
    await session.withTransaction(async () => {
      await db
        .collection<Document & { _id: string }>("public_memory_heads")
        .deleteMany(
          { _id: { $in: eventIds.map((id) => `event:${id}`) } },
          { session },
        );
      await db
        .collection("public_memory_revisions")
        .deleteMany(
          { kind: "event", recordId: { $in: eventIds } },
          { session },
        );
      await db
        .collection<{ eventIds: string[] }>("public_memory_clubs")
        .updateMany(
          { eventIds: { $in: eventIds } },
          { $pull: { eventIds: { $in: eventIds } } },
          { session },
        );
      await db
        .collection("public_memory_clubs")
        .deleteMany({ eventIds: { $size: 0 } }, { session });
    });
  } finally {
    await session.endSession();
  }
}

/** Authenticated route/assistant read-only query; no refresh, spending or writes. Literal bounded query
 * searches only public history (including cancellations), max 40 events/40 deadlines/20 organizers.
 * Throws on >200-character query or unavailable Mongo. No caller-selected private scope exists. */
/** Words too generic to identify anybody on their own. An organizer whose whole name
 * is made of these is never matched, so "what do clubs do" cannot select a club. */
const genericNameWords = new Set([
  "club", "clubs", "the", "and", "of", "at", "for", "a", "an", "vt", "virginia",
  "tech", "hokie", "hokies", "university", "student", "students", "organization",
  "org", "association", "society", "group", "center", "centre", "team", "council",
  "program", "programs", "department", "office", "events", "event",
]);
const nameWords = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** Deterministic identity matching. A name matches only when every word of that name
 * appears in the question and at least one of those words is distinctive, so a
 * question about "clubs" in general selects nobody. Pure function: no I/O or model. */
export function matchHistoryName(
  question: string,
  candidates: { name: string; clubId?: string }[],
): { kind: "club" | "observed-organizer"; name: string; clubId?: string } | null {
  const asked = new Set(nameWords(question));
  if (!asked.size) return null;
  let best: { name: string; clubId?: string; words: number } | null = null;
  for (const candidate of candidates) {
    const words = nameWords(candidate.name || "");
    if (!words.length) continue;
    if (!words.some((word) => !genericNameWords.has(word))) continue;
    if (!words.every((word) => asked.has(word))) continue;
    // Prefer the most specific name, so "Fencing Club" beats "Fencing".
    if (!best || words.length > best.words)
      best = { name: candidate.name, clubId: candidate.clubId, words: words.length };
  }
  if (!best) return null;
  // Only an account-owned workspace is an identity. An organizer name observed on a
  // public listing is evidence of a name, never proof of who that club is.
  return best.clubId
    ? { kind: "club", name: best.name, clubId: best.clubId }
    : { kind: "observed-organizer", name: best.name };
}

/** One past public event by id, for flows that must reach beyond the current
 * listings. Current listings only contain upcoming events, so this is how an event
 * that has already happened stays reachable. Withdrawn records are deleted from
 * public memory, so an absent result is exactly the withdrawal signal. Read-only. */
export async function publicEventById(id: string): Promise<CampusEvent | null> {
  if (typeof id !== "string" || !id || id.length > 200) return null;
  const row = await database()
    .collection("public_memory_heads")
    .findOne({ _id: `event:${id}` as never });
  const value = row?.value as CampusEvent | undefined;
  return value && typeof value.start === "string" && value.id ? value : null;
}
/** Which of these events public memory still holds. A withdrawn or deleted source is
 * simply absent from the result, which is what marks a personal record unavailable.
 * Bounded read; no writes, model calls or private context. */
export async function publicEventsByIds(ids: string[]): Promise<CampusEvent[]> {
  const wanted = [...new Set(ids.filter((id) => typeof id === "string" && id))].slice(0, 500);
  if (!wanted.length) return [];
  const rows = await database()
    .collection("public_memory_heads")
    .find({ _id: { $in: wanted.map((id) => `event:${id}`) } as never })
    .maxTimeMS(3000)
    .toArray();
  return rows
    .map((row) => row.value as CampusEvent | undefined)
    .filter((value): value is CampusEvent => !!value?.id && typeof value.start === "string");
}
export async function publicEventIds(ids: string[]): Promise<Set<string>> {
  return new Set((await publicEventsByIds(ids)).map((event) => event.id));
}
/** Past public activity for a club or an observed organizer named in the question.
 * Read-only and deterministic: no model call, no writes, no private context. Only
 * events that have already started are returned, so a historical example can never be
 * presented as an upcoming plan. Withdrawn records are absent from storage already. */
export async function clubHistory(
  question: string,
  identities: { name: string; clubId?: string }[] = [],
  limit = 8,
  now = Date.now(),
): Promise<ClubHistoryView> {
  const asked = nameWords(String(question ?? "")).filter(
    (word) => word.length >= 3 && !genericNameWords.has(word),
  );
  if (!asked.length) return { matched: null, entries: [], missing: true };
  const db = database();
  // Verified workspaces first: they are the only names that carry an identity.
  let matched = matchHistoryName(question, identities);
  if (!matched) {
    // Bounded candidate read: organizers sharing any distinctive word with the
    // question, then the same all-words rule decides which one was actually named.
    const pattern = asked
      .slice(0, 6)
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const rows = await db
      .collection("public_memory_heads")
      .find({ kind: "event", "value.organizer": { $regex: pattern, $options: "i" } })
      .project({ "value.organizer": 1 })
      .limit(200)
      .maxTimeMS(3000)
      .toArray();
    const names = [
      ...new Set(
        rows
          .map((row) => (row.value as { organizer?: unknown })?.organizer)
          .filter((name): name is string => typeof name === "string" && !!name.trim()),
      ),
    ];
    matched = matchHistoryName(question, names.map((name) => ({ name })));
  }
  if (!matched) return { matched: null, entries: [], missing: true };
  const rows = await db
    .collection("public_memory_heads")
    .find({
      kind: "event",
      ...(matched.clubId ? { "value.clubId": matched.clubId } : { "value.organizer": matched.name }),
      "value.start": { $lt: new Date(now).toISOString() },
      "value.status": { $ne: "cancelled" },
    })
    .sort({ "value.start": -1, _id: 1 })
    .limit(200)
    .maxTimeMS(3000)
    .toArray();
  const entries: ClubHistoryEntry[] = [];
  for (const row of rows) {
    if (entries.length >= Math.max(1, Math.min(8, limit))) break;
    const value = row.value as CampusEvent | undefined;
    if (!value || typeof value.start !== "string") continue;
    const started = Date.parse(value.start);
    // History only. An event that has not happened is not evidence of what a club has done.
    if (!Number.isFinite(started) || started >= now) continue;
    const sourceUrl = (value.sources || []).find((source) =>
      /^https:\/\//i.test(source?.url || ""),
    )?.url;
    if (!sourceUrl || !value.title) continue;
    entries.push({
      eventId: value.id,
      title: value.title,
      start: value.start,
      timezone: value.timezone || "America/New_York",
      sourceUrl,
      categories: Array.isArray(value.categories) ? [...value.categories] : [],
    });
  }
  return { matched, entries, missing: !entries.length };
}

export async function searchPublicMemory(query: string): Promise<{
  events: CampusEvent[];
  deadlines: CampusDeadline[];
  clubs: PublicClubMemory[];
}> {
  if (typeof query !== "string" || query.length > 200)
    throw new Error("Public memory query must be at most 200 characters");
  const literal = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = literal
    ? {
        $or: [
          { "value.title": { $regex: literal, $options: "i" } },
          { "value.description": { $regex: literal, $options: "i" } },
          { "value.organizer": { $regex: literal, $options: "i" } },
        ],
      }
    : {};
  const db = database();
  const [events, deadlines, clubs] = await Promise.all([
    db
      .collection("public_memory_heads")
      .find({ kind: "event", ...match })
      .sort({ "value.start": -1, _id: 1 })
      .limit(40)
      .maxTimeMS(3000)
      .toArray(),
    db
      .collection("public_memory_heads")
      .find({ kind: "deadline", ...match })
      .sort({ "value.dueDate": -1, _id: 1 })
      .limit(40)
      .maxTimeMS(3000)
      .toArray(),
    db
      .collection("public_memory_clubs")
      .find(literal ? { name: { $regex: literal, $options: "i" } } : {})
      .sort({ lastSeenAt: -1, _id: 1 })
      .limit(20)
      .maxTimeMS(3000)
      .toArray(),
  ]);
  return {
    events: events.map((row) => row.value as CampusEvent),
    deadlines: deadlines.map((row) => row.value as CampusDeadline),
    clubs: clubs.map(({ _id, ...club }) => club as unknown as PublicClubMemory),
  };
}
