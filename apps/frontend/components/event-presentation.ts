import type { CampusEvent } from "@gobbler/shared";

const campusPhotos = ["campus-drillfield", "campus-torgersen", "campus-library", "campus-burruss"];
const sportPhotos: [RegExp, string][] = [
  [/\bfootball\b/i, "football"],
  [/\bwomen'?s basketball\b/i, "womens-basketball"],
  [/\bbasketball\b/i, "mens-basketball"],
  [/\bvolleyball\b/i, "volleyball"],
  [/\bwomen'?s soccer\b/i, "womens-soccer"],
  [/\bsoccer\b/i, "mens-soccer"],
  [/\btennis\b/i, "mens-tennis"],
  [/\bswim(?:ming)?\b|\bdiving\b/i, "swimming-diving"],
  [/\bwrestling\b/i, "wrestling"],
  [/\bsoftball\b/i, "softball"],
  [/\bbaseball\b/i, "baseball"],
  [/\bgolf\b/i, "mens-golf"],
  [/\blacrosse\b/i, "lacrosse"],
  [/\bcross[ -]country\b/i, "cross-country"],
  [/\btrack\b/i, "track-field"],
];

/** Decorative card presentation only: no event mutation, provider access, or domain inference.
 * Stable per-ID assortment avoids shuffling on render. Safe for any viewer; no effects/errors. */
export function eventCardPhotos(event: CampusEvent) {
  let hash = 0;
  for (const char of event.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  const sportLabel = (event.sports?.sport || event.title).replace(/[’']/g, "'").replace(/-/g, " ");
  const sport = event.sports || event.categories.includes("Sports")
    ? sportPhotos.find(([pattern]) => pattern.test(sportLabel))?.[1]
    : undefined;
  const fallback = {
    url: `/event-photos/${sport || campusPhotos[hash % campusPhotos.length]}.webp`,
    alt: sport ? "Illustrative Virginia Tech sports photo" : "Virginia Tech campus placeholder photo",
  };
  const vtGame = event.sources.some(source => source.source === "vt-sports");
  const images = event.media?.filter(media => media.kind === "image" && media.url);
  // A merged event can carry several photos; favor its original GobblerConnect cover.
  const original = images?.find(media => media.sourceUrl && /^https:\/\/gobblerconnect\.vt\.edu\//i.test(media.sourceUrl)) || images?.[0];
  return { cover: vtGame ? fallback : original || fallback, fallback };
}

/** Display spacing for previously cached deadline text; source extraction fixes new imports. */
export const deadlineText = (value: string) => value.replace(
  /\b((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+20\d{2})?)(?=[A-Z])/g,
  "$1 ",
);
