import type {
  CampusEvent,
  CampusDeadline,
  SourceHealth,
} from "../../../packages/shared/src/contracts.js";
import { db, mongoClient } from "./store.js";
import { consolidateEvents } from "./event-consolidation.js";
import { agentHandoffPolicy } from "./agent-policy.js";
import { publicSources } from "./public-source-registry.js";
import { collectPublicSource, semanticHash } from "./public-ingestion.js";
import { publicSourceRepository } from "./public-source-store.js";
import { createPublicFetcher } from "./public-fetch.js";
import { randomUUID } from "node:crypto";
import { recordPublicMemory } from "./public-memory.js";
export let cachedEvents: CampusEvent[] = [];
export let cachedDeadlines: CampusDeadline[] = [];
export const sourceStatus: Record<string, SourceHealth> = Object.fromEntries(
  publicSources.map((s) => [s.id, { status: "pending" }]),
);
let snapshots = new Map<string, CampusEvent[]>();
let deadlineSnapshots = new Map<string, CampusDeadline[]>();
let running: Promise<void> | undefined;
let loaded = false;
let memoryHash: string | undefined;
const nextChecks = new Map<string, number>();
export function reconcileEvents(raw: CampusEvent[], previous: CampusEvent[]) {
  return consolidateEvents(raw, previous);
}

export async function restoreSources() {
  if (loaded) return;
  if (db) {
    cachedEvents = await db
      .collection<CampusEvent>("events")
      .find({}, { projection: { _id: 0 } })
      .toArray();
    for (const row of await db
      .collection("source_snapshots")
      .find({})
      .toArray()) {
      snapshots.set(row.source, row.events || []);
      deadlineSnapshots.set(row.source, row.deadlines || []);
      sourceStatus[row.source] = {
        status: "cached",
        lastSync: row.syncedAt,
        count: (row.events || []).length,
        completeness: "partial",
      };
    }
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
    for (const row of await db
      .collection("public_source_health")
      .find({})
      .toArray()) {
      sourceStatus[row.source] = { ...sourceStatus[row.source], ...row.health };
      if (row.nextCheck) nextChecks.set(row.source, row.nextCheck);
    }
  }
  cachedDeadlines = [...deadlineSnapshots.values()].flat();
  loaded = true;
}
/** Backend-only source commit. Preserves other source snapshots, atomically writes changed canonical
 * records, and retains history in snapshots. Empty/partial parsing never erases a source. */
export async function replaceSourceSnapshot(
  source: string,
  events: CampusEvent[],
  deadlines: CampusDeadline[] = [],
) {
  const definition = publicSources.find((s) => s.id === source);
  if (!definition) throw new Error("Unknown public source");
  agentHandoffPolicy.authorize({
    sender: definition.source === "vt-events" ? "vt-events" : definition.source,
    recipient: "coordinator",
    kind: "public_events",
    visibility: "public",
  });
  if (
    events.some(
      (e) =>
        !e.sources.length ||
        e.sources.some((s) => s.source !== definition.source),
    ) ||
    deadlines.some((d) => d.sources.some((s) => s.source !== definition.source))
  )
    throw new Error("Source snapshot identity mismatch");
  if (!events.length && !deadlines.length)
    throw new Error("The source returned no validated records");
  if (
    Buffer.byteLength(JSON.stringify({ events, deadlines })) >
    12 * 1024 * 1024
  )
    throw new Error("Source snapshot exceeds configured limit");
  const next = new Map(snapshots);
  next.set(source, events);
  const nextDeadlines = new Map(deadlineSnapshots);
  nextDeadlines.set(source, deadlines);
  const merged = reconcileEvents([...next.values()].flat(), cachedEvents),
    syncedAt = new Date().toISOString();
  const old = new Map(cachedEvents.map((e) => [e.id, semanticHash(e)]));
  const changed = merged.filter((e) => old.get(e.id) !== semanticHash(e));
  if (db && mongoClient) {
    const database = db,
      session = mongoClient.startSession();
    try {
      await session.withTransaction(async () => {
        await database
          .collection("source_snapshots")
          .updateOne(
            { source },
            { $set: { source, events, deadlines, syncedAt } },
            { upsert: true, session },
          );
        if (changed.length)
          await database.collection("events").bulkWrite(
            changed.map((event) => ({
              replaceOne: {
                filter: { id: event.id },
                replacement: event,
                upsert: true,
              },
            })),
            { session },
          );
        const active = new Set(merged.map((e) => e.id)),
          removed = cachedEvents
            .filter((e) => !active.has(e.id))
            .map((e) => e.id);
        if (removed.length)
          await database
            .collection("events")
            .deleteMany({ id: { $in: removed } }, { session });
      });
    } finally {
      await session.endSession();
    }
  }
  snapshots = next;
  deadlineSnapshots = nextDeadlines;
  cachedEvents = merged;
  cachedDeadlines = [...nextDeadlines.values()].flat();
  sourceStatus[source] = {
    status: "live",
    lastSync: syncedAt,
    count: events.length + deadlines.length,
    completeness: "partial",
  };
}
/** Scheduled shared collection, due-source checks only. Mongo lease prevents overlapping replicas.
 * Failed sources back off; successful unchanged pages do not rewrite event records or invoke models. */
export async function refreshSources() {
  if (running) return running;
  running = (async () => {
    await restoreSources();
    // Minute scheduler ticks must not reload every snapshot from Atlas when
    // no source is due. Restore once on startup; refresh from storage only
    // after acquiring a lease for actual collection work.
    if (
      publicSources.every(
        (source) => (nextChecks.get(source.id) || 0) > Date.now(),
      )
    )
      return;
    const owner = randomUUID();
    let leased = false;
    if (db) {
      try {
        const lease = await db
          .collection<{ _id: string; owner: string; until: Date }>(
            "public_source_leases",
          )
          .findOneAndUpdate(
            { _id: "poll", until: { $lt: new Date() } },
            { $set: { owner, until: new Date(Date.now() + 30 * 60000) } },
            { upsert: true, returnDocument: "after" },
          );
        leased = lease?.owner === owner;
      } catch {
        return;
      }
      if (!leased) return;
      // Another replica may have committed since this process last held the lease.
      loaded = false;
      await restoreSources();
    }
    try {
      for (const source of publicSources) {
        if ((nextChecks.get(source.id) || 0) > Date.now()) continue;
        if (db) {
          const renewed = await db
            .collection<{ _id: string; owner: string; until: Date }>(
              "public_source_leases",
            )
            .updateOne(
              { _id: "poll", owner },
              { $set: { until: new Date(Date.now() + 30 * 60000) } },
            );
          if (!renewed.matchedCount) break;
        }
        let delay = source.intervalMs;
        try {
          const batch = await collectPublicSource(
            source,
            publicSourceRepository,
            createPublicFetcher(),
          );
          if (!batch.events.length && !batch.deadlines.length)
            throw new Error("No qualifying records available");
          // Even unchanged checkpoints may need publication after an earlier commit failure/restart.
          const desired = semanticHash([...batch.events, ...batch.deadlines]),
            existing = semanticHash([
              ...(snapshots.get(source.id) || []),
              ...(deadlineSnapshots.get(source.id) || []),
            ]);
          if (desired !== existing)
            await replaceSourceSnapshot(
              source.id,
              batch.events,
              batch.deadlines,
            );
          sourceStatus[source.id] = {
            ...sourceStatus[source.id],
            status: batch.errors
              ? "partial"
              : batch.changed
                ? "live"
                : "unchanged",
            lastSync: batch.checkedAt,
            count: batch.events.length + batch.deadlines.length,
            completeness: "partial",
            ...(batch.errors
              ? {
                  error:
                    "Some pages could not be refreshed; prior records retained.",
                }
              : { error: undefined }),
          };
        } catch {
          delay = Math.max(delay, 3600000);
          sourceStatus[source.id] = {
            ...sourceStatus[source.id],
            status: "error",
            error:
              "Source unavailable or no supported event/deadline records. Prior records retained.",
            completeness: "unknown",
          };
        }
        nextChecks.set(source.id, Date.now() + delay);
        if (db)
          await db.collection("public_source_health").updateOne(
            { source: source.id },
            {
              $set: {
                source: source.id,
                health: sourceStatus[source.id],
                nextCheck: nextChecks.get(source.id),
              },
            },
            { upsert: true },
          );
      }
      const currentMemoryHash = semanticHash([cachedEvents, cachedDeadlines]);
      if (db && memoryHash !== currentMemoryHash) {
        // Bound each transaction; initial public feeds can contain thousands of records.
        for (let i = 0; i < cachedEvents.length; i += 100)
          await recordPublicMemory(cachedEvents.slice(i, i + 100), []);
        for (let i = 0; i < cachedDeadlines.length; i += 100)
          await recordPublicMemory([], cachedDeadlines.slice(i, i + 100));
        memoryHash = currentMemoryHash;
      }
    } finally {
      if (db && leased)
        await db
          .collection<{ _id: string; owner: string; until: Date }>(
            "public_source_leases",
          )
          .updateOne({ _id: "poll", owner }, { $set: { until: new Date(0) } });
    }
  })().finally(() => {
    running = undefined;
  });
  return running;
}
/** Read-only current public projection; date-only activities remain eligible through their campus date. */
export function liveEvents(now = Date.now()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  return cachedEvents
    .filter((e) =>
      e.timeDetails?.precision === "date_only" && e.timeDetails.startDate
        ? (e.timeDetails.endDate || e.timeDetails.startDate) >= today
        : Date.parse(e.end || e.start) >= now - 3600000,
    )
    .map((e) => ({
      ...e,
      stale: e.sources.every((s) => {
        const health = sourceStatus[s.providerId || s.source];
        return (
          !health?.lastSync ||
          now - Date.parse(health.lastSync) > 24 * 3600000 ||
          health.status === "error"
        );
      }),
    }));
}
export function liveDeadlines() {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return cachedDeadlines
    .filter((d) => d.status === "active" && d.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
