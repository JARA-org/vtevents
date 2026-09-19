import { CampusEvent } from "../../../packages/shared/src/index.js";
import { db } from "./store.js";
import { fetchGobbler, fetchSports, deduplicate } from "./sources.js";
export let cachedEvents: CampusEvent[] = [];
export const sourceStatus: Record<string, any> = {
  gobblerconnect: { status: "pending" },
  "vt-sports": { status: "pending" },
};
let running: Promise<void> | undefined;
export async function refreshSources() {
  if (running) return running;
  running = (async () => {
    if (!cachedEvents.length && db)
      cachedEvents = (await db
        .collection("events")
        .find({}, { projection: { _id: 0 } })
        .toArray()) as unknown as CampusEvent[];
    for (const [source, fetcher] of [
      ["gobblerconnect", fetchGobbler],
      ["vt-sports", fetchSports],
    ] as const) {
      try {
        const events = await fetcher();
        if (!events.length)
          throw new Error("The source returned no validated events.");
        cachedEvents = deduplicate([
          ...cachedEvents.filter(
            (e) => !e.sources.some((s) => s.source === source),
          ),
          ...events,
        ]);
        sourceStatus[source] = {
          status: "live",
          lastSync: new Date().toISOString(),
          count: events.length,
        };
        if (db)
          await db
            .collection("events")
            .bulkWrite(
              cachedEvents.map((event) => ({
                updateOne: {
                  filter: { id: event.id },
                  update: { $set: event },
                  upsert: true,
                },
              })),
            );
      } catch (err) {
        sourceStatus[source] = {
          ...sourceStatus[source],
          status: "error",
          error: err instanceof Error ? err.message : "Source unavailable",
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
