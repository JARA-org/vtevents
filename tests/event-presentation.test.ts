import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { testEvents } from "./fixtures/events.js";
import { deadlineText, eventCardPhotos } from "../apps/frontend/components/event-presentation.js";

test("card photos preserve source images, vary stable campus fallbacks, and match sports", () => {
  const event = { ...testEvents()[0], media: [], sports: undefined };
  const photo = { kind: "image" as const, url: "https://gobblerconnect.vt.edu/flyer.jpg", sourceUrl: "https://gobblerconnect.vt.edu/rsvp?id=1" };
  assert.equal(eventCardPhotos({ ...event, media: [photo] }).cover, photo);
  assert.equal(eventCardPhotos({ ...event, categories: ["Sports"], title: "Football club", media: [photo] }).cover, photo);
  const campus = Array.from({ length: 20 }, (_, i) => eventCardPhotos({ ...event, id: `event-${i}` }).cover.url);
  assert.equal(new Set(campus).size, 4);
  assert.equal(eventCardPhotos(event).cover.url, eventCardPhotos(event).cover.url);
  for (const sport of ["Football", "Men's Basketball", "Women's Basketball", "Volleyball", "Men's Soccer", "Women's Soccer", "Tennis", "Swimming & Diving", "Wrestling", "Baseball", "Softball", "Golf", "Lacrosse", "Track & Field", "Cross Country"]) {
    const game = { ...event, sports: { sport }, sources: [{ ...event.sources[0], source: "vt-sports" as const }], media: [photo] };
    const { cover } = eventCardPhotos(game);
    assert.ok(!cover.url.includes("campus-"), sport);
    assert.ok(existsSync(new URL(`../apps/frontend/public${cover.url}`, import.meta.url)), sport);
    if (sport === "Football") assert.equal(cover.url, "/event-photos/football.webp");
    if (sport === "Volleyball") assert.equal(cover.url, "/event-photos/volleyball.webp");
  }
  for (const url of campus) assert.ok(existsSync(new URL(`../apps/frontend/public${url}`, import.meta.url)));
});

test("cached deadline display separates dates from actions without changing valid text", () => {
  const action = "Last day to change grade option from A-F to P/F. Last day to drop individual courses.";
  assert.equal(deadlineText("October 6" + action), "October 6 " + action);
  assert.equal(deadlineText("October 6, 2026" + action), "October 6, 2026 " + action);
  assert.equal(deadlineText("October 6 " + action), "October 6 " + action);
  assert.equal(deadlineText("October 6th deadline"), "October 6th deadline");
});
