import { CampusEvent } from "./domain.js";
import { db, mongoClient } from "./store.js";
import { fetchGobbler, fetchSports, deduplicate } from "./sources.js";
import { hash } from "./security.js";
type Source = "gobblerconnect" | "vt-sports";
export let cachedEvents: CampusEvent[] = [];
export const sourceStatus: Record<string, any> = {
  gobblerconnect: { status: "pending" },
  "vt-sports": { status: "pending" },
};
let snapshots = new Map<Source, CampusEvent[]>();
let running: Promise<void> | undefined;
let loaded = false;

// Source records stay separate so a refresh cannot erase another's provenance.
export function reconcileEvents(raw: CampusEvent[], previous: CampusEvent[]) {
  const aliases = new Map<string, string>();
  for (const event of previous)
    for (const source of event.sources)
      aliases.set(`${source.source}:${source.sourceId}`, event.id);
  const used = new Set<string>();
  return deduplicate(raw).map((event) => {
    const candidate = event.sources
      .map((source) => aliases.get(`${source.source}:${source.sourceId}`))
      .find((id) => id && !used.has(id));
    let id = candidate || event.id;
    if (used.has(id))
      id = `event-${hash(JSON.stringify(event.sources.map((s) => [s.source, s.sourceId]))).slice(0, 24)}`;
    used.add(id);
    return { ...event, id };
  });
}

export async function restoreSources() {
  if (loaded) return;
  if (db) {
    cachedEvents = (await db
      .collection("events")
      .find({}, { projection: { _id: 0 } })
      .toArray()) as unknown as CampusEvent[];
    for (const row of await db
      .collection("source_snapshots")
      .find({})
      .toArray()) {
      snapshots.set(row.source, row.events);
      sourceStatus[row.source] = {
        status: "cached",
        lastSync: row.syncedAt,
        count: row.events.length,
      };
    }
    // Migration: preserve old cached sources until each completes a refresh.
    for (const source of ["gobblerconnect", "vt-sports"] as const)
      if (!snapshots.has(source))
        snapshots.set(
          source,
          cachedEvents
            .filter((e) => e.sources.some((s) => s.source === source))
            .map((e) => ({
              ...e,
              sources: e.sources.filter((s) => s.source === source),
            })),
        );
  }
  loaded = true;
}

export async function replaceSourceSnapshot(
  source: Source,
  events: CampusEvent[],
) {
  if (!events.length)
    throw new Error("The source returned no validated events.");
  // Stay below MongoDB's document limit; preserve the last good snapshot on failure.
  if (Buffer.byteLength(JSON.stringify(events)) > 12 * 1024 * 1024)
    throw new Error("Source snapshot exceeds the configured size limit.");
  const next = new Map(snapshots);
  next.set(source, events);
  const merged = reconcileEvents([...next.values()].flat(), cachedEvents);
  const syncedAt = new Date().toISOString();
  if (db && mongoClient) {
    const database = db;
    const session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        await database
          .collection("source_snapshots")
          .updateOne(
            { source },
            { $set: { source, events, syncedAt } },
            { upsert: true, session },
          );
        await database.collection("events").bulkWrite(
          merged.map((event) => ({
            updateOne: {
              filter: { id: event.id },
              update: { $set: event },
              upsert: true,
            },
          })),
          { session },
        );
        await database
          .collection("events")
          .deleteMany({ id: { $nin: merged.map((e) => e.id) } }, { session });
      });
    } finally {
      await session.endSession();
    }
  }
  snapshots = next;
  cachedEvents = merged;
  sourceStatus[source] = {
    status: "live",
    lastSync: syncedAt,
    count: events.length,
  };
}

export async function refreshSources() {
  if (running) return running;
  running = (async () => {
    await restoreSources();
    for (const [source, fetcher] of [
      ["gobblerconnect", fetchGobbler],
      ["vt-sports", fetchSports],
    ] as const) {
      try {
        await replaceSourceSnapshot(source, await fetcher());
      } catch {
        sourceStatus[source] = {
          ...sourceStatus[source],
          status: "error",
          error:
            "Source refresh failed. Previously cached listings may be stale.",
        };
      }
    }
  })().finally(() => {
    running = undefined;
  });
  return running;
}
export function liveEvents() {
  return cachedEvents
    .filter((e) => Date.parse(e.end || e.start) >= Date.now() - 3600000)
    .map((e) => ({
      ...e,
      stale: e.sources.every(
        (s) => Date.now() - Date.parse(s.fetchedAt) > 24 * 3600000,
      ),
    }));
}
