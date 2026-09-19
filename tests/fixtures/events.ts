import { DateTime } from "luxon";
import type { CampusEvent } from "../../packages/shared/src/contracts.js";
import { CAMPUS_TZ, eventSchema } from "../../apps/backend/src/domain.js";
export function testEvents(now = DateTime.now()): CampusEvent[] {
  const day = now.setZone(CAMPUS_TZ).startOf("day");
  return [
    [
      "Sunset on the Huckleberry",
      "An easy evening walk with a little fresh air and good company. Bring water and comfortable shoes.",
      "Outdoors",
      "Huckleberry Trail entrance",
      18,
      0,
    ],
    [
      "Create & connect: pottery night",
      "Try hand-building a little something at a relaxed, beginner-friendly creative hangout.",
      "Arts & music",
      "Squires Student Center",
      19,
      1,
    ],
    [
      "Hokies under the lights",
      "A sample game-night meetup. Bring your school spirit and check real schedules before heading out.",
      "Sports",
      "Lane Stadium",
      18,
      2,
    ],
    [
      "Build something together",
      "A friendly makers meetup for curious students. No experience required.",
      "Tech & science",
      "Newman Library",
      17,
      3,
    ],
    [
      "Coffee, cookies & new friends",
      "A low-key afternoon to meet students across campus.",
      "Food & fun",
      "Squires Student Center",
      16,
      1,
    ],
    [
      "Make a little difference",
      "A sample community volunteer morning with a campus service group.",
      "Community",
      "Drillfield",
      10,
      4,
    ],
    [
      "Your next chapter: career meetup",
      "Practice introductions and trade internship-search tips with other students.",
      "Career",
      "Smith Career Center",
      16,
      2,
    ],
  ].map(([title, description, category, location, hour, offset], i) => {
    const start = day
      .plus({ days: Number(offset) + 1 })
      .set({ hour: Number(hour) });
    return eventSchema.parse({
      id: `test-${i + 1}`,
      title,
      description,
      start: start.toUTC().toISO(),
      end: start.plus({ hours: 1.5 }).toUTC().toISO(),
      timezone: CAMPUS_TZ,
      location,
      organizer: "Sample student organization",
      categories: [category],
      sources: [
        {
          source: "gobblerconnect",
          sourceId: String(i + 1),
          url: "https://gobblerconnect.vt.edu/events",
          fetchedAt: now.toUTC().toISO(),
        },
      ],
      updatedAt: now.toUTC().toISO(),
      status: "scheduled",
      mode: "live",
    });
  });
}
