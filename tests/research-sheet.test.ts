import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { parseResearchSheet, RESEARCH_SHEET_URL } from "../apps/backend/src/research-sheet.js";
import type { PublicSourceDefinition } from "../packages/shared/src/contracts.js";

const source: PublicSourceDefinition = { id: "research", label: "Research", source: "vt-events", kind: "mixed", seeds: [RESEARCH_SHEET_URL], allowedHosts: ["www.research.vt.edu", "docs.google.com"], intervalMs: 3600000, maxPages: 10 };
const now = DateTime.fromISO("2026-09-19T12:00:00Z");
const cols = ["Event Name", "Event Date", "Start Time", "End Time", "Short Description", "LINK", "College", "Zoom Link (If applicable)", "Remove date if applicable"].map((label) => ({ label }));
const row = (values: unknown[]) => ({ c: values.map((v) => v === null ? null : { v }) });
const wrapped = (rows: unknown[]) => `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify({ status: "ok", table: { cols, rows } })});`;
const values = ["Research seminar", "Date(2026,8,21)", "9:30 a.m.", "11:00 a.m.", "Location: Newman Library Room 101\nDiscuss research.", "https://www.research.vt.edu/events/seminar.html", "Research unit", null, null];

test("research sheet parses numeric dates and explicit venues without executing script", () => {
  const result = parseResearchSheet(wrapped([row(values)]), RESEARCH_SHEET_URL, source, now);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].start, "2026-09-21T13:30:00.000Z");
  assert.equal(result.events[0].end, "2026-09-21T15:00:00.000Z");
  assert.equal(result.events[0].location, "Newman Library Room 101");
  assert.equal(result.events[0].onlineUrl, undefined);
  assert.deepEqual(result.links, [values[5]]);
  assert.equal(result.events[0].sources[0].url, RESEARCH_SHEET_URL);
  assert.equal(parseResearchSheet(wrapped([row(values)]), RESEARCH_SHEET_URL, source, now.plus({ days: 1 })).events[0].id, result.events[0].id);
  assert.throws(() => parseResearchSheet(wrapped([row(values)]) + "globalThis.pwned=true;", RESEARCH_SHEET_URL, source, now), /wrapper/);
  assert.throws(() => parseResearchSheet("evilCallback({});", RESEARCH_SHEET_URL, source, now), /wrapper/);
  assert.throws(() => parseResearchSheet(wrapped([]), "https://docs.google.com/untrusted", source, now), /Unapproved/);
});

test("research sheet does not manufacture online venues from registration or detail links", () => {
  const noVenue = [...values]; noVenue[4] = "Research presentation"; noVenue[7] = "https://virginiatech.zoom.us/meeting/register/example";
  const result = parseResearchSheet(wrapped([row(noVenue)]), RESEARCH_SHEET_URL, source, now);
  assert.equal(result.events.length, 0);
  assert.deepEqual(result.links, [values[5]], "qualified details remain discoverable when venue is missing");
  noVenue[5] = null;
  const online = parseResearchSheet(wrapped([row(noVenue)]), RESEARCH_SHEET_URL, source, now);
  assert.equal(online.events[0].isOnline, true);
  assert.equal(online.events[0].location, null);
  noVenue[7] = "javascript:alert(1)";
  assert.equal(parseResearchSheet(wrapped([row(noVenue)]), RESEARCH_SHEET_URL, source, now).events.length, 0);
});

test("research sheet rejects ambiguous dates, invalid intervals, schema changes and external discovery", () => {
  for (const badDate of ["Date(2026,1,30)", "September 21", "Date(2026,12,1)", "Date(2026,8,21);evil()"])
    assert.equal(parseResearchSheet(wrapped([row(values.map((v, i) => i === 1 ? badDate : v))]), RESEARCH_SHEET_URL, source, now).events.length, 0);
  const backwards = [...values]; backwards[3] = "8:00 a.m.";
  assert.equal(parseResearchSheet(wrapped([row(backwards)]), RESEARCH_SHEET_URL, source, now).events.length, 0);
  const unknownTime = [...values]; unknownTime[2] = "TBD";
  assert.equal(parseResearchSheet(wrapped([row(unknownTime)]), RESEARCH_SHEET_URL, source, now).events[0].timeTBD, true);
  const removed = [...values]; removed[8] = "Date(2026,8,18)";
  assert.equal(parseResearchSheet(wrapped([row(removed)]), RESEARCH_SHEET_URL, source, now).events.length, 0);
  const outside = [...values]; outside[5] = "https://unapproved.example/events/one";
  assert.equal(parseResearchSheet(wrapped([row(outside)]), RESEARCH_SHEET_URL, source, now).links.length, 0);
  assert.throws(() => parseResearchSheet(wrapped([]).replace("Event Name", "Renamed"), RESEARCH_SHEET_URL, source, now), /columns/);
  const formatted = row(values); formatted.c[2] = { v: 0.4, f: "10:15 AM" } as { v: unknown };
  assert.equal(parseResearchSheet(wrapped([formatted]), RESEARCH_SHEET_URL, source, now).events[0].start, "2026-09-21T14:15:00.000Z");
});
