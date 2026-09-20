import { z } from "zod";
import type {
  AttendanceCandidate,
  AttendanceRecord,
  CampusEvent,
  Category,
  InferredInterest,
  UserMemoryService,
  UserMemoryView,
} from "../../../packages/shared/src/contracts.js";
import { database, db, mongoClient } from "./store.js";
import { HttpError } from "./config.js";
import { categories, profileSchema, emptyProfile } from "./domain.js";
import { publicEventsByIds } from "./public-memory.js";

/** Stored attendance. userId is always taken from the authenticated session by the
 * caller; it is never read from a request body. */
type Row = AttendanceRecord & { userId: string };
const attendance = () => database().collection<Row>("user_attendance");

/** Bounds every read and every model context. A person with thousands of
 * confirmations must not produce an unbounded query, response or prompt. */
export const ATTENDANCE_LIMIT = 200;
export const CONTEXT_ATTENDANCE_LIMIT = 12;
export const CONTEXT_HISTORY_LIMIT = 8;
/** How many recently ended saved events may be offered for confirmation, and how far
 * back. Beyond this a person is unlikely to remember reliably. */
export const CONFIRMABLE_LIMIT = 10;
export const CONFIRMABLE_WINDOW_MS = 90 * 24 * 3600000;

const eventIdSchema = z.string().min(1).max(200);
const scopeSchema = z.enum(["attendance", "all"]);

/** Derived from confirmed attendance only, and reported separately from the
 * interests the user stated. Never written back into the profile. */
export function inferInterests(
  records: AttendanceRecord[],
): InferredInterest[] {
  const counts = new Map<Category, number>();
  for (const record of records)
    if (record.available !== false)
      for (const category of new Set(record.categories))
        if ((categories as readonly string[]).includes(category))
          counts.set(category, (counts.get(category) || 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, fromAttendance]) => ({ category, fromAttendance }));
}

/** Snapshot of the public facts a person needs to recognize their own record.
 * Announcement text is not copied; only the fields already published for the event. */
function snapshot(
  event: CampusEvent,
): Omit<Row, "userId" | "confirmedAt" | "source"> {
  const sourceUrl = event.sources.find((s) => /^https:\/\//i.test(s.url))?.url;
  return {
    eventId: event.id,
    title: event.title,
    start: event.start,
    timezone: event.timezone,
    organizer: event.organizer,
    ...(sourceUrl ? { sourceUrl } : {}),
    categories: [...event.categories],
  };
}

function toRecord(
  row: Row,
  availableIds: Set<string> | null,
): AttendanceRecord {
  const {
    userId: _userId,
    _id: _storageId,
    ...record
  } = row as Row & { _id?: unknown };
  return {
    ...record,
    available: availableIds ? availableIds.has(row.eventId) : true,
  };
}

async function profileOf(userId: string) {
  const stored = await database().collection("profiles").findOne({ userId });
  if (!stored) return emptyProfile;
  const parsed = profileSchema.safeParse(stored);
  // A damaged profile is a server fault, never reported as the person's input.
  if (!parsed.success)
    throw new HttpError(
      503,
      "Your saved preferences could not be loaded. Please try again shortly.",
    );
  return parsed.data;
}

/** Past events this caller saved and has not answered about. Saving is only a reason
 * to ask: the record is created exclusively by their own confirmation. Bounded, and
 * limited to the recent past so the question stays answerable. */
async function confirmableFor(
  userId: string,
  confirmed: Set<string>,
  now: number,
  available: CampusEvent[] = [],
): Promise<AttendanceCandidate[]> {
  const saved = await database()
    .collection<{ userId: string; eventId: string }>("saved")
    .find({ userId })
    .limit(ATTENDANCE_LIMIT)
    .toArray();
  const pending = saved
    .map((row) => row.eventId)
    .filter(
      (eventId) => typeof eventId === "string" && !confirmed.has(eventId),
    );
  if (!pending.length) return [];
  const archived = await publicEventsByIds(pending);
  const remembered = [
    ...new Map(
      [
        ...archived,
        ...available.filter((event) => pending.includes(event.id)),
      ].map((event) => [event.id, event]),
    ).values(),
  ];
  return remembered
    .filter((event) => {
      const ended = Date.parse(event.end || event.start);
      return (
        event.status !== "cancelled" &&
        Number.isFinite(ended) &&
        ended < now &&
        now - ended < CONFIRMABLE_WINDOW_MS
      );
    })
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, CONFIRMABLE_LIMIT)
    .map((event) => {
      const {
        eventId,
        title,
        start,
        timezone,
        organizer,
        sourceUrl,
        categories,
      } = snapshot(event);
      return {
        eventId,
        title,
        start,
        timezone,
        organizer,
        sourceUrl,
        categories,
      };
    });
}

async function build(
  userId: string,
  available?: CampusEvent[],
): Promise<UserMemoryView> {
  const [profile, rows] = await Promise.all([
    profileOf(userId),
    attendance()
      .find({ userId }, { projection: { _id: 0 } })
      .sort({ start: -1, eventId: 1 })
      .limit(ATTENDANCE_LIMIT)
      .toArray(),
  ]);
  const availableIds = available
    ? new Set(available.map((event) => event.id))
    : null;
  const records = rows.map((row) => toRecord(row, availableIds));
  const confirmed = new Set(records.map((record) => record.eventId));
  const confirmable = await confirmableFor(
    userId,
    confirmed,
    Date.now(),
    available,
  );
  return {
    statedInterests: [...profile.interests],
    inferredInterests: inferInterests(records),
    attendance: records,
    ...(confirmable.length ? { confirmable } : {}),
    aiEnabled: profile.aiEnabled,
  };
}

export const userMemory: UserMemoryService = {
  async view(userId, events) {
    if (!db) throw new HttpError(503, "Storage unavailable.");
    return build(userId, events);
  },
  async confirm(userId, eventId, attended, events) {
    if (!db) throw new HttpError(503, "Storage unavailable.");
    const id = eventIdSchema.parse(eventId);
    if (typeof attended !== "boolean")
      throw new HttpError(400, "Say whether you attended this event.");
    if (attended) {
      // Attendance is confirmed against what this caller can actually see.
      // An event they cannot see, or one that has not begun, is not confirmable.
      const event = events.find(
        (candidate) => candidate.id === id || candidate.aliases?.includes(id),
      );
      if (!event)
        throw new HttpError(
          404,
          "This event is no longer in the current listings.",
        );
      if (
        !Number.isFinite(Date.parse(event.start)) ||
        Date.parse(event.start) > Date.now()
      )
        throw new HttpError(
          400,
          "You can confirm attendance once the event has started.",
        );
      if (event.status === "cancelled")
        throw new HttpError(400, "This event was cancelled.");
      if (!mongoClient) throw new HttpError(503, "Storage unavailable.");
      const session = mongoClient.startSession();
      try {
        await session.withTransaction(async () => {
          await database()
            .collection<{ _id: string; revision: number }>("user_memory_locks")
            .updateOne(
              { _id: userId },
              { $inc: { revision: 1 } },
              { upsert: true, session },
            );
          const existing = await attendance().countDocuments(
            { userId },
            { session },
          );
          const already = await attendance().findOne(
            { userId, eventId: event.id },
            { session },
          );
          if (!already && existing >= ATTENDANCE_LIMIT)
            throw new HttpError(
              409,
              "You have reached the number of events Gobbler can remember. Remove one first.",
            );
          // Idempotent: repeating a confirmation keeps its original timestamp.
          await attendance().updateOne(
            { userId, eventId: event.id },
            {
              $set: { userId, ...snapshot(event) },
              $setOnInsert: {
                confirmedAt: new Date().toISOString(),
                source: "user" as const,
              },
            },
            { upsert: true, session },
          );
        });
      } finally {
        await session.endSession();
      }
    } else await attendance().deleteOne({ userId, eventId: id });
    return build(userId, events);
  },
  async forget(userId, scope) {
    if (!db) throw new HttpError(503, "Storage unavailable.");
    scopeSchema.parse(scope);
    await attendance().deleteMany({ userId });
    return build(userId);
  },
  async erase(userId) {
    if (!db) return;
    await attendance().deleteMany({ userId });
  },
};

/** Bounded, permitted context for one model request. Called only after the caller's
 * own AI opt-in is checked. Contains no identifiers, credentials, calendar content or
 * any other person's data, and withheld (unavailable) records are excluded so a
 * withdrawn source never re-enters an explanation. */
export function memoryContext(memory: UserMemoryView) {
  const attended = memory.attendance
    .filter((record) => record.available !== false)
    .slice(0, CONTEXT_ATTENDANCE_LIMIT)
    .map((record) => ({
      title: record.title.slice(0, 200),
      date: record.start.slice(0, 10),
      categories: record.categories,
    }));
  return {
    statedInterests: memory.statedInterests,
    inferredInterests: inferInterests(memory.attendance).map((i) => i.category),
    attendedEvents: attended,
  };
}
