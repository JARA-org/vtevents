import type {
  CampusEvent,
  CampusDeadline,
  Profile,
  Recommendation,
  TimelineItem,
} from "../../../packages/shared/src/contracts.js";
export type {
  CampusEvent,
  Profile,
} from "../../../packages/shared/src/contracts.js";
import { z } from "zod";
import { DateTime } from "luxon";

export const CAMPUS_TZ = "America/New_York";
export const categories = [
  "Arts & music",
  "Sports",
  "Outdoors",
  "Tech & science",
  "Community",
  "Career",
  "Food & fun",
] as const;
const instant = z.string().datetime({ offset: true });
const publicUrl = z.string().url().refine(v => /^https?:\/\//i.test(v) && !new URL(v).username && !new URL(v).password);
export const mediaSchema = z.object({url:publicUrl,kind:z.enum(["image","video"]),alt:z.string().max(1000).optional(),credit:z.string().max(500).optional(),sourceUrl:publicUrl.optional()});
export const sourceSchema = z.object({
  providerId: z.string().optional(),
  label: z.string().optional(),
  sourceUpdatedAt: instant.nullable().optional(),
  source: z.enum([
    "gobblerconnect",
    "vt-sports",
    "vt-events",
    "discord",
  ]),
  sourceId: z.string().min(1),
  url: z
    .string()
    .url()
    .refine((v) => v.startsWith("https://"), "Sources must use HTTPS"),
  fetchedAt: instant,
});
export const eventSchema = z
  .object({
    media: z.array(mediaSchema).max(30).optional(),
    links: z.array(z.object({label:z.string().max(300),url:publicUrl,kind:z.enum(["source","tickets","stream","stats","recap","other"]),embeddable:z.boolean().optional()})).max(50).optional(),
    sports: z.object({sport:z.string(),opponent:z.string().nullable(),venueType:z.enum(["home","away","neutral","unknown"]),state:z.enum(["upcoming","live","final","postponed","cancelled","unknown"]),homeScore:z.string().nullable().optional(),awayScore:z.string().nullable().optional(),period:z.string().nullable().optional(),clock:z.string().nullable().optional(),opponentLogoUrl:publicUrl.optional(),checkedAt:instant.optional()}).optional(),
    timeDetails: z.object({precision:z.enum(["confirmed","date_only","start_only","end_only","unknown"]),startDate:z.string().optional(),endDate:z.string().optional(),note:z.string().optional(),confirmedStart:instant.nullable().optional(),confirmedEnd:instant.nullable().optional()}).optional(),
    admission: z.object({price:z.string().optional(),currency:z.string().optional(),free:z.boolean().optional(),availability:z.string().optional()}).optional(),
    audience: z.array(z.string()).max(30).optional(),
    address: z.string().max(2000).optional(),
    registrationUrl: publicUrl.optional(),
    organizerUrl: publicUrl.optional(),
    ownerCorrected: z.boolean().optional(),
    aliases: z.array(z.string()).optional(),
    id: z.string().min(1),
    title: z.string().min(1).max(300),
    description: z.string().max(12000).default(""),
    start: instant,
    end: instant.nullable(),
    timezone: z.string().default(CAMPUS_TZ),
    location: z.string().nullable(),
    onlineUrl: z
      .string()
      .url()
      .refine(
        (v) =>
          /^https?:\/\//i.test(v) &&
          !new URL(v).username &&
          !new URL(v).password,
        "Attendance links must be HTTP(S) without credentials",
      )
      .nullable()
      .optional(),
    isOnline: z.boolean().optional(),
    organizer: z.string().nullable(),
    categories: z.array(z.enum(categories)),
    sources: z.array(sourceSchema).min(1),
    updatedAt: instant,
    status: z.enum(["scheduled", "cancelled"]),
    mode: z.literal("live"),
    timeTBD: z.boolean().default(false),
    allDay: z.boolean().default(false),
    endEstimated: z.boolean().default(false),
  })
  .refine(
    (x) => !x.end || Date.parse(x.end) > Date.parse(x.start),
    "End must follow start",
  );

export const deadlineSchema = z.object({
  id:z.string().min(1),title:z.string().min(1).max(300),description:z.string().max(12000),
  dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>DateTime.fromISO(v).isValid),
  dueAt:instant.optional(),timezone:z.string().default(CAMPUS_TZ),audience:z.array(z.string()).max(30).optional(),
  term:z.string().max(300).optional(),submissionUrl:publicUrl.optional(),sources:z.array(sourceSchema).min(1),
  updatedAt:instant,status:z.enum(["active","withdrawn"]),media:z.array(mediaSchema).max(30).optional(),
}).refine(v=>!v.dueAt||DateTime.fromISO(v.dueAt).setZone(v.timezone).toISODate()===v.dueDate,"Deadline date and cutoff disagree");

/** Fields whose schema accepts a value or absence but never null. Documents written
 * before store.ts set `ignoreUndefined` recorded absent optional fields as BSON null,
 * so a stored null means "absent" for exactly these keys. Nullable fields are
 * deliberately excluded (end, location, organizer, onlineUrl, opponent, sourceUpdatedAt,
 * confirmedStart/confirmedEnd, scores, period, clock): their null is real data. */
const absentWhenNull = {
  event: ["description", "timezone", "media", "links", "sports", "timeDetails",
    "admission", "audience", "address", "registrationUrl", "organizerUrl",
    "ownerCorrected", "aliases", "isOnline", "timeTBD", "allDay", "endEstimated"],
  deadline: ["timezone", "dueAt", "audience", "term", "submissionUrl", "media"],
  source: ["providerId", "label"],
  media: ["alt", "credit", "sourceUrl"],
  link: ["embeddable"],
  sports: ["opponentLogoUrl", "checkedAt"],
  timeDetails: ["startDate", "endDate", "note"],
  admission: ["price", "currency", "free", "availability"],
} as const;
const storedDefaults = {
  description: "",
  timezone: CAMPUS_TZ,
  timeTBD: false,
  allDay: false,
  endEstimated: false,
};
function withoutAbsent(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object") return value;
  const next = { ...(value as Record<string, unknown>) };
  for (const key of keys) if (next[key] === null) delete next[key];
  return next;
}
function normalizeRecord(value: unknown, keys: readonly string[]) {
  const record = withoutAbsent(value, keys) as Record<string, unknown>;
  if (!record || typeof record !== "object") return record;
  for (const [field, nested] of [
    ["sources", absentWhenNull.source],
    ["media", absentWhenNull.media],
    ["links", absentWhenNull.link],
  ] as const)
    if (Array.isArray(record[field]))
      record[field] = (record[field] as unknown[]).map((item) =>
        withoutAbsent(item, nested),
      );
  for (const [field, nested] of [
    ["sports", absentWhenNull.sports],
    ["timeDetails", absentWhenNull.timeDetails],
    ["admission", absentWhenNull.admission],
  ] as const)
    if (record[field]) record[field] = withoutAbsent(record[field], nested);
  return record;
}
/** Pure shape repair for one stored record. No I/O, model calls or field invention:
 * it only removes legacy null placeholders and applies the schema's own defaults. */
export function normalizeStoredEvent(value: unknown): unknown {
  const record = normalizeRecord(value, absentWhenNull.event);
  return record && typeof record === "object"
    ? { ...storedDefaults, ...record }
    : record;
}
export function normalizeStoredDeadline(value: unknown): unknown {
  const record = normalizeRecord(value, absentWhenNull.deadline);
  return record && typeof record === "object"
    ? { timezone: CAMPUS_TZ, ...record }
    : record;
}
/** Validates one stored record, preserving fields the schema does not declare
 * (clubId, revision, visibility, evidence, conflicts, extensions). Returns null for a
 * record that cannot be represented, so one unusable row never discards the rest.
 * Read-only: no writes, retries or provider calls. */
export function parseStoredEvent(value: unknown): CampusEvent | null {
  const record = normalizeStoredEvent(value);
  return eventSchema.safeParse(record).success ? (record as CampusEvent) : null;
}
export function parseStoredDeadline(value: unknown): CampusDeadline | null {
  const record = normalizeStoredDeadline(value);
  return deadlineSchema.safeParse(record).success
    ? (record as CampusDeadline)
    : null;
}

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  interests: z.array(z.enum(categories)).max(7),
  onboarded: z.boolean(),
  aiEnabled: z.boolean().default(false),
});

export const emptyProfile: Profile = {
  name: "Hokie",
  interests: [],
  onboarded: false,
  aiEnabled: false,
};

export function recommendations(
  events: CampusEvent[],
  profile: Profile,
  saved: string[] = [],
  feedback: Record<string, number> = {},
) {
  return events
    .filter((e) => e.status !== "cancelled")
    .map((event) => {
      const matched = event.categories.filter((c) =>
          profile.interests.includes(c),
        );
      return {
        event,
        score:
          matched.length * 20 +
          (saved.includes(event.id) ? 4 : 0) +
          (feedback[event.id] || 0) * 8,
        reason: matched.length
          ? `Matches your interest in ${matched.join(" and ").toLowerCase()}.`
          : `A chance to explore something new.`,
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.event.start.localeCompare(b.event.start),
    );
}
/** Select up to limit recommendations from one day, given the session profile
 * and already selected items. Stronger explicit interest overlap wins first;
 * ties explore less represented categories, organizers and source families.
 * Pure backend ranking, no I/O/auth effects, no transaction. Trusted route owns
 * session scope; deterministic and safe to repeat with the same inputs. */
export function curateTimelineRecommendations(
  candidates: Recommendation[], profile: Profile, previous: TimelineItem[], limit: number,
): TimelineItem[] {
  const pool = candidates.map(recommendation => ({ recommendation,
    matchedInterests: recommendation.event.categories.filter(c => profile.interests.includes(c)),
  }));
  const picked: TimelineItem[] = [];
  const representation = (item: TimelineItem) => {
    const event = item.recommendation.event;
    let penalty = 0;
    for (const prior of [...previous, ...picked]) {
      const other = prior.recommendation.event;
      // Category diversity includes academic/career and campus-wide source families;
      // do not fabricate popularity, attendance or "major event" significance.
      penalty += event.categories.filter(c => other.categories.includes(c)).length * 4;
      if (event.organizer && event.organizer === other.organizer) penalty += 3;
      if (event.sources[0]?.source === other.sources[0]?.source) penalty += 1;
    }
    return penalty;
  };
  while (picked.length < limit && pool.length) {
    pool.sort((a, b) => b.matchedInterests.length - a.matchedInterests.length ||
      representation(a) - representation(b) ||
      b.recommendation.score - a.recommendation.score ||
      Date.parse(a.recommendation.event.start) - Date.parse(b.recommendation.event.start) ||
      a.recommendation.event.id.localeCompare(b.recommendation.event.id));
    picked.push(pool.shift()!);
  }
  return picked;
}

export function questionFilter(query: string) {
  const q = query.toLowerCase(),
    days = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
  const weekday = days.findIndex((d) => q.includes(d)),
    time = q.match(/after\s+(\d{1,2})(?::(\d\d))?\s*(am|pm)?/);
  let afterHour = time ? Number(time[1]) : null;
  if (afterHour !== null) {
    if (time?.[3] === "pm" && afterHour < 12) afterHour += 12;
    else if (time?.[3] === "am" && afterHour === 12) afterHour = 0;
    else if (!time?.[3] && afterHour <= 7) afterHour += 12;
  }
  const category =
    categories.find((c) => q.includes(c.toLowerCase())) ||
    (/outdoor|hik|walk|nature/.test(q)
      ? "Outdoors"
      : /art|music|creative/.test(q)
        ? "Arts & music"
        : /sport|football|game day/.test(q)
          ? "Sports"
          : /tech|coding|science/.test(q)
            ? "Tech & science"
            : /food|coffee/.test(q)
              ? "Food & fun"
              : null);
  return {
    weekday: weekday < 0 ? null : weekday + 1,
    afterHour,
    category,
    weekend: q.includes("weekend"),
    today: q.includes("today"),
    tomorrow: q.includes("tomorrow"),
  };
}
export function filterQuestion(
  events: CampusEvent[],
  filter: ReturnType<typeof questionFilter>,
  now = DateTime.now(),
) {
  const today = now.setZone(CAMPUS_TZ).startOf("day");
  let day = filter.tomorrow
    ? today.plus({ days: 1 })
    : filter.today
      ? today
      : filter.weekday
        ? today.plus({ days: (filter.weekday - today.weekday + 7) % 7 })
        : null;
  return events.filter((e) => {
    const t = DateTime.fromISO(e.start).setZone(CAMPUS_TZ);
    return (
      (!day || t.hasSame(day, "day")) &&
      (!filter.weekend || t.weekday >= 6) &&
      (filter.afterHour === null ||
        (!e.timeTBD && !e.allDay && t.hour >= filter.afterHour)) &&
      (!filter.category || e.categories.includes(filter.category))
    );
  });
}
