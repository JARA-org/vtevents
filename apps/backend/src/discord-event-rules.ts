import { z } from "zod";
import { DateTime } from "luxon";
import type { DiscordEventCandidate } from "../../../packages/shared/src/contracts.js";
const quote = z.string().trim().min(1).max(2000);
const proposal = z
  .object({
    date: z.string(),
    title: quote.max(300),
    description: z.string().max(12000),
    location: quote.nullable(),
    onlineUrl: z.string().url().nullable(),
    isOnline: z.boolean(),
    evidence: z
      .object({
        date: quote,
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
    .replace(/(\d)(st|nd|rd|th)\b/gi, "$1")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
  for (const format of [
    "yyyy-MM-dd",
    "MMMM d yyyy",
    "MMM d yyyy",
    "d MMMM yyyy",
    "d MMM yyyy",
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
): DiscordEventCandidate | null {
  if (/\[no-ai\]/i.test(text)) return null;
  const parsed = proposal.safeParse(value);
  if (!parsed.success) return null;
  const p = parsed.data;
  for (const evidence of Object.values(p.evidence))
    if (evidence && !text.includes(evidence)) return null;
  if (
    explicitDiscordDate(p.evidence.date) !== p.date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(p.date)
  )
    return null;
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
  return p;
}
