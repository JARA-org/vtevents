import { z } from "zod";
import { DateTime } from "luxon";
import type {
  DiscordEventCandidate,
  DiscordExtractionContext,
} from "../../../packages/shared/src/contracts.js";
const quote = z.string().trim().min(1).max(2000);
const proposal = z
  .object({
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    date: z.string(),
    dateReasoning: z.string().trim().min(1).max(1000).optional(),
    dateMessageId: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional(),
    title: quote.max(300),
    description: z.string().max(12000),
    location: quote.nullable(),
    onlineUrl: z.string().url().nullable(),
    isOnline: z.boolean(),
    evidence: z
      .object({
        date: z.union([quote, z.literal("")]),
        title: quote,
        location: quote.nullable(),
        online: quote.nullable(),
      })
      .strict(),
  })
  .strict();
/** No inferred year/current date. Only a complete, unambiguous, explicitly written date qualifies. */
export function explicitDiscordDate(value: string): string | null {
  const cleaned = value
    .trim()
    .replace(
      /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+/i,
      "",
    )
    .replace(/(\d)(st|nd|rd|th)\b/gi, "$1")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
  for (const format of [
    "yyyy-MM-dd",
    "MMMM d yyyy",
    "MMM d yyyy",
    "d MMMM yyyy",
    "d MMM yyyy",
    "M/d/yyyy",
  ]) {
    const date = DateTime.fromFormat(cleaned, format, {
      locale: "en-US",
      zone: "America/New_York",
    });
    if (/\b\d{4}\b/.test(cleaned) && date.isValid) return date.toISODate();
  }
  return null;
}
/** Model output is only a proposal: date, title/description and a physical/online venue must be grounded in exact message evidence. Never invent a start time. */
export function validateDiscordCandidate(
  value: unknown,
  text: string,
  context?: DiscordExtractionContext,
): DiscordEventCandidate | null {
  if (/\[no-ai\]/i.test(text)) return null;
  const parsed = proposal.safeParse(value);
  if (!parsed.success) return null;
  const p = parsed.data;
  if (context?.messages) {
    const source = context.messages.find(
      (m) => m.messageId === p.dateMessageId,
    );
    if (!source || !source.text.includes(p.evidence.date)) return null;
    context = { ...context, postedAt: source.createdAt };
  }
  for (const evidence of Object.values(p.evidence))
    if (evidence && !text.includes(evidence)) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(p.date) ||
    explicitDiscordDate(p.date) !== p.date
  )
    return null;
  const explicit = explicitDiscordDate(p.evidence.date);
  if (p.evidence.date === "") {
    // Absence is interpreted by extraction; the fallback date itself is fixed by
    // authenticated provider metadata, never by model reasoning or processing time.
    if (!context || context.timezone !== "America/New_York") return null;
    const posted = DateTime.fromISO(context.postedAt, { setZone: true }).setZone(context.timezone);
    if (!posted.isValid || p.date !== posted.toISODate()) return null;
    // Do not let omission of date evidence erase an explicit or ambiguous day.
    // URLs are not date expressions (e.g. a video id may contain numbers).
    const prose = text.replace(/https?:\/\/\S+/gi, "")
      .replace(/\b\d{1,2}:[0-5]\d\s*(?:AM|PM)?/gi, "");
    if (/\b(today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|week|weekend|month|year|days?|weeks?|months?|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|soon|sometime|later)\b|\b\d{1,2}[/-]\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}(st|nd|rd|th)\b/i.test(prose)) return null;
    p.dateReasoning = "No day specified; defaults to the original posting date in America/New_York.";
  } else if (explicit) {
    if (explicit !== p.date) return null;
  } else {
    if (!context || !p.dateReasoning) return null;
    const posted = DateTime.fromISO(context.postedAt, {
      setZone: true,
    }).setZone(context.timezone);
    if (!posted.isValid) return null;
    const expression = p.evidence.date.trim().toLowerCase();
    // Obvious arithmetic is deterministic; the model handles linguistic interpretation.
    const offsets: Record<string, number> = {
      today: 0,
      tonight: 0,
      tomorrow: 1,
      yesterday: -1,
      "day after tomorrow": 2,
      "the day after tomorrow": 2,
    };
    const simpleRelative = /\b(today|tonight|tomorrow|yesterday)\b/.exec(
      expression,
    )?.[1];
    const offset =
      expression in offsets
        ? offsets[expression]
        : simpleRelative
          ? offsets[simpleRelative]
          : undefined;
    if (
      offset !== undefined &&
      posted.plus({ days: offset }).toISODate() !== p.date
    )
      return null;
    const weekday =
      /^(?:(?:this|next|coming|last)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.exec(
        expression,
      )?.[1];
    if (
      weekday &&
      DateTime.fromISO(p.date, { zone: context.timezone })
        .setLocale("en-US")
        .toFormat("cccc")
        .toLowerCase() !== weekday
    )
      return null;
    // Require actual temporal evidence; an arbitrary title cannot justify an invented date.
    if (
      !/\b(today|tonight|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|week|weekend|month|year|days?|weeks?|months?|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b|\b\d{1,2}[/-]\d{1,2}\b|\b\d{1,2}(st|nd|rd|th)\b/i.test(
        expression,
      )
    )
      return null;
    // Impossible explicit dates must not be rescued by treating them as relative.
    if (/\b\d{4}\b/.test(expression)) return null;
  }
  if (!text.includes(p.title) || !p.evidence.title.includes(p.title))
    return null;
  // Descriptions remain exact source extracts too: no unsupported model-written claims.
  if (p.description && !text.includes(p.description)) return null;
  if (
    p.location &&
    (!p.evidence.location || !p.evidence.location.includes(p.location))
  )
    return null;
  if (p.onlineUrl) {
    const url = new URL(p.onlineUrl);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      !text.includes(p.onlineUrl) ||
      !p.isOnline
    )
      return null;
    if (!p.evidence.online?.includes(p.onlineUrl)) return null;
  }
  if (
    p.isOnline &&
    !p.onlineUrl &&
    (!p.evidence.online ||
      !/\b(online|virtual|zoom|webex|teams|discord|google meet)\b/i.test(
        p.evidence.online,
      ))
  )
    return null;
  if (!p.location && !p.isOnline) return null;
  // Clock arithmetic is deterministic. Ignore model-supplied times and derive
  // only an explicit, unique same-day AM/PM range from the source evidence.
  const { startTime: ignoredStart, endTime: ignoredEnd, ...grounded } = p;
  const ranges = [...text.matchAll(/\b(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)\s*[-–—]\s*(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)\b/gi)];
  let times: {startTime?:string;endTime?:string} = {};
  if (ranges.length === 1 && !/\b(?:UTC|GMT|PST|PDT|CST|CDT|MST|MDT)\b/i.test(text)) {
    const m = ranges[0];
    const clock = (h:string,min:string|undefined,period:string) => Number(h)>=1 && Number(h)<=12 ? `${String(Number(h)%12+(period.toUpperCase()==="PM"?12:0)).padStart(2,"0")}:${min||"00"}` : undefined;
    const startTime=clock(m[1],m[2],m[3]), endTime=clock(m[4],m[5],m[6]);
    if(startTime && endTime && endTime>startTime) {
      const clocks=[startTime,endTime].map(t=>DateTime.fromISO(`${p.date}T${t}`,{zone:"America/New_York"}));
      if(clocks.every((clock,i)=>clock.isValid && clock.toFormat("HH:mm")===[startTime,endTime][i] && clock.getPossibleOffsets().length===1)) times={startTime,endTime};
    }
  }
  // Recover clearly labeled attendance links from existing stored proposals too.
  // Never treat unrelated URLs (registration, source links, etc.) as attendance.
  if (!grounded.onlineUrl) {
    const links=[...text.matchAll(/\b(?:watch|join)\s+(?:(?:online|live)\s+)?(?:through|at|via|on)\s+<?(https?:\/\/[^\s<>]+)/gi)];
    if(links.length===1) {
      const url=links[0][1].replace(/[.,;!?)]+$/,"");
      try { const parsed=new URL(url); if(!parsed.username&&!parsed.password) {grounded.onlineUrl=url;grounded.isOnline=true;grounded.evidence.online=links[0][0];} } catch { /* Invalid source URL stays absent. */ }
    }
  }
  return {...grounded,...times};
}
