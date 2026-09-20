import type {
  CampusEvent,
  Profile,
  Fit,
} from "../../../packages/shared/src/contracts.js";
export type {
  CampusEvent,
  Profile,
  Fit,
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
    "canvas",
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

export const recurringSchema = z
  .object({
    id: z.string(),
    weekday: z.number().int().min(1).max(7),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    kind: z.enum(["free", "busy"]),
  })
  .refine(
    (x) => x.end > x.start,
    "Use separate blocks for overnight availability",
  );
export const busySchema = z
  .object({
    id: z.string(),
    start: instant,
    end: instant,
    source: z.enum(["manual", "google", "canvas"]),
  })
  .refine((x) => Date.parse(x.end) > Date.parse(x.start));
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  interests: z.array(z.enum(categories)).max(7),
  recurring: z.array(recurringSchema).max(70),
  busy: z.array(busySchema).max(500),
  onboarded: z.boolean(),
  aiEnabled: z.boolean().default(false),
});

export const emptyProfile: Profile = {
  name: "Hokie",
  interests: [],
  recurring: [],
  busy: [],
  onboarded: false,
  aiEnabled: false,
};

export function scheduleFit(event: CampusEvent, profile: Profile): Fit {
  if (!event.end || event.endEstimated || event.allDay || event.timeTBD)
    return {
      status: "unknown",
      reason:
        "The source does not provide a precise event time. Check before making plans.",
    };
  const start = DateTime.fromISO(event.start).setZone(CAMPUS_TZ),
    end = DateTime.fromISO(event.end).setZone(CAMPUS_TZ);
  if (
    profile.busy.some(
      (b) =>
        Date.parse(b.start) < end.toMillis() &&
        Date.parse(b.end) > start.toMillis(),
    )
    )
      return {
        status: "conflict",
        reason: "Overlaps a busy block in your schedule.",
      };
    // Providers can publish multi-year registration/activity windows. Do not
    // expand them into thousands of recurring daily intervals on a web request,
    // or claim that the whole window is confirmed free. Exact busy blocks above
    // still provide a definite conflict without expansion.
    if (end.diff(start, "days").days > 31)
      return {
        status: "unknown",
        reason: "This listing spans more than a month. Confirm individual meeting times before making plans.",
      };
    if (!profile.recurring.length)
      return {
        status: "unknown",
        reason: "Availability is missing for part or all of this event.",
      };
  const intervals: { start: number; end: number; kind: string }[] = [];
  let ambiguousTime = false;
  for (let day = start.startOf("day"); day <= end; day = day.plus({ days: 1 }))
    for (const b of profile.recurring.filter(
      (b) => b.weekday === day.weekday,
    )) {
      const [sh, sm] = b.start.split(":").map(Number),
        [eh, em] = b.end.split(":").map(Number);
      const blockStart = day.set({ hour: sh, minute: sm }),
        blockEnd = day.set({ hour: eh, minute: em });
      if (
        blockStart.toFormat("HH:mm") !== b.start ||
        blockEnd.toFormat("HH:mm") !== b.end ||
        blockStart.getPossibleOffsets().length > 1 ||
        blockEnd.getPossibleOffsets().length > 1
      ) {
        ambiguousTime = true;
        continue;
      }
      intervals.push({
        start: blockStart.toMillis(),
        end: blockEnd.toMillis(),
        kind: b.kind,
      });
    }
  if (
    intervals.some(
      (b) =>
        b.kind === "busy" &&
        b.start < end.toMillis() &&
        b.end > start.toMillis(),
    )
  )
    return { status: "conflict", reason: "Overlaps your recurring busy time." };
  if (ambiguousTime)
    return {
      status: "unknown",
      reason:
        "A recurring block falls in a daylight-saving clock change. Confirm your availability for this date.",
    };
  let covered = start.toMillis();
  for (const b of intervals
    .filter((b) => b.kind === "free")
    .sort((a, b) => a.start - b.start))
    if (b.start <= covered && b.end > covered) covered = b.end;
  return covered >= end.toMillis()
    ? {
        status: "free",
        reason: "Fits entirely within the availability you shared.",
      }
    : {
        status: "unknown",
        reason: "Availability is missing for part or all of this event.",
      };
}
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
        ),
        fit = scheduleFit(event, profile);
      return {
        event,
        fit,
        score:
          matched.length * 20 +
          (fit.status === "free" ? 15 : fit.status === "conflict" ? -30 : 0) +
          (saved.includes(event.id) ? 4 : 0) +
          (feedback[event.id] || 0) * 8,
        reason: matched.length
          ? `Matches your interest in ${matched.join(" and ").toLowerCase()}. ${fit.reason}`
          : `A chance to explore something new. ${fit.reason}`,
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.event.start.localeCompare(b.event.start),
    );
}
export function eventICS(e: CampusEvent) {
  const esc = (v: string) =>
    v
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  const stamp = (v: string) =>
    DateTime.fromISO(v).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//My Gobbler//Campus Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}@my-little-gobbler`,
    `DTSTAMP:${stamp(e.updatedAt)}`,
    e.timeTBD || e.allDay
      ? `DTSTART;VALUE=DATE:${DateTime.fromISO(e.start).setZone(e.timezone).toFormat("yyyyMMdd")}`
      : `DTSTART:${stamp(e.start)}`,
    ...(e.end && !e.timeTBD && !e.allDay ? [`DTEND:${stamp(e.end)}`] : []),
    ...(e.end && e.allDay && !e.timeTBD
      ? [
          `DTEND;VALUE=DATE:${DateTime.fromISO(e.end).setZone(e.timezone).toFormat("yyyyMMdd")}`,
        ]
      : []),
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc((e.timeTBD ? "Start time is to be confirmed.\n" : "") + e.description + (e.onlineUrl ? "\nJoin online: " + e.onlineUrl : e.isOnline ? "\nOnline attendance; link not supplied." : "") + "\nSource: " + e.sources[0].url)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    `URL:${e.sources[0].url}`,
    `STATUS:${e.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return (
    lines
      .map((line) => {
        let out = "",
          count = 0;
        for (const ch of line) {
          const size = new TextEncoder().encode(ch).length;
          if (count + size > 74) {
            out += "\r\n ";
            count = 1;
          }
          out += ch;
          count += size;
        }
        return out;
      })
      .join("\r\n") + "\r\n"
  );
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
