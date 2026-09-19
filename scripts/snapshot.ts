import { mkdir, writeFile } from "node:fs/promises";
import {
  fetchGobbler,
  fetchSports,
  deduplicate,
} from "../apps/backend/src/sources.js";
const sources: Record<string, unknown> = {},
  events = [];
for (const [name, fetcher] of [
  ["gobblerconnect", fetchGobbler],
  ["vt-sports", fetchSports],
] as const) {
  try {
    const data = await fetcher();
    events.push(...data);
    sources[name] = {
      status: "snapshot",
      lastSync: new Date().toISOString(),
      count: data.length,
    };
  } catch {
    sources[name] = {
      status: "unavailable",
      error: "Snapshot refresh failed; no sample data was substituted.",
    };
  }
}
await mkdir("apps/frontend/public", { recursive: true });
await writeFile(
  "apps/frontend/public/campus-events.json",
  JSON.stringify({
    mode: "live",
    snapshot: true,
    generatedAt: new Date().toISOString(),
    sources,
    events: deduplicate(events)
      .filter((e) => Date.parse(e.end || e.start) > Date.now())
      .slice(0, 1000),
  }),
);
console.log("Public event snapshot generated. No private context included.");
