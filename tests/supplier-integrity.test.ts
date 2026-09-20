import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { config } from "../apps/backend/src/config.js";
import { parseStoredEvent, parseStoredDeadline } from "../apps/backend/src/domain.js";

/** Storage-backed tests must never reach a hosted cluster; see stored-records.test.ts. */
function useDisposableStorage(uri: string, name: string) {
  config.mongo = uri;
  config.db = name;
  assert.match(
    new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).hostname,
    /^(127\.0\.0\.1|localhost|::1)$/,
    "tests must only ever connect to a local disposable database",
  );
}

const GUILD = "111111111111111111";
const CHANNEL = "222222222222222222";
const WATCH_FROM = "300000000000000000";
// Announcement text every candidate below quotes exactly; evidence must be a substring.
const TEXT =
  "Fencing Club open house on October 3, 2026 at War Memorial Gym. Come try it out!";
function candidate() {
  return {
    date: "2026-10-03",
    title: "Fencing Club open house",
    description: "Come try it out!",
    location: "War Memorial Gym",
    onlineUrl: null,
    isOnline: false,
    evidence: {
      date: "October 3, 2026",
      title: "Fencing Club open house",
      location: "War Memorial Gym",
      online: null,
    },
  };
}
function row(messageId: string, patch: Record<string, unknown> = {}) {
  return {
    key: `${GUILD}:${CHANNEL}:${messageId}`,
    guildId: GUILD,
    channelId: CHANNEL,
    messageId,
    text: TEXT,
    imageTexts: [],
    createdAt: "2026-09-20T05:07:53.377000+00:00",
    editedAt: null,
    sourceUrl: `https://discord.com/channels/${GUILD}/${CHANNEL}/${messageId}`,
    fingerprint: `fp-${messageId}`,
    candidate: candidate(),
    status: "qualified",
    ...patch,
  };
}

test("a damaged Discord source record is excluded without removing the healthy ones", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  useDisposableStorage(mongo.getUri(), "supplier_integrity_test");
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const { discordPublication } = await import(
    "../apps/backend/src/discord-publication.js"
  );
  const db = store.database();
  try {
    await db.collection("user").insertOne({ id: "owner-1", email: "owner@example.test" } as never);
    await db.collection("managed_clubs").insertOne({
      _id: "club-1", name: "Fencing Club", ownerId: "owner-1",
      requestId: "req-1", discordGuildId: GUILD,
    } as never);
    await db.collection("discord_bot_channels").insertOne({
      _id: `${GUILD}:${CHANNEL}`, guildId: GUILD, channelId: CHANNEL,
      enabled: true, watchFrom: WATCH_FROM, scan: { cursor: WATCH_FROM },
    } as never);

    // Each damaged row breaks a different field the published event depends on.
    const damaged = {
      "400000000000000001": { sourceUrl: null },
      "400000000000000002": { sourceUrl: "ftp://discord.com/x" },
      "400000000000000003": { createdAt: null },
      "400000000000000004": { createdAt: "not-a-timestamp" },
      "400000000000000005": { text: "" },
      "400000000000000006": { candidate: null },
      "400000000000000007": { candidate: { ...candidate(), title: "A title that is not in the message" } },
      "400000000000000008": { candidate: { ...candidate(), date: "2026-02-30" } },
      "400000000000000009": { candidate: { ...candidate(), location: null, isOnline: false } },
      "400000000000000010": { key: `${GUILD}:${CHANNEL}:400000000000000010`, guildId: "999999999999999999" },
    };
    await db.collection("discord_collected_messages").insertMany([
      row("400000000000000100"),
      row("400000000000000101"),
      ...Object.entries(damaged).map(([id, patch]) => row(id, patch)),
    ] as never[]);

    const published = await discordPublication.list({ includePast: true });
    const ids = published.map((p) => p.event.sources[0].sourceId).sort();
    assert.deepEqual(
      ids,
      [
        `${GUILD}:${CHANNEL}:400000000000000100`,
        `${GUILD}:${CHANNEL}:400000000000000101`,
      ],
      "only the undamaged announcements publish",
    );
    // Every published record satisfies the contract it is served under.
    for (const { event } of published) {
      assert.ok(parseStoredEvent(event), "a published event must validate");
      assert.equal(event.clubId, "club-1");
      assert.equal(event.organizer, "Fencing Club");
      assert.match(event.sources[0].url, /^https:\/\/discord\.com\/channels\//);
      assert.equal(typeof event.updatedAt, "string");
    }

    // A club record missing its name cannot produce an event with no organizer.
    await db.collection("managed_clubs").updateOne(
      { _id: "club-1" as never },
      { $unset: { name: "" } },
    );
    assert.deepEqual(
      await discordPublication.list({ includePast: true }),
      [],
      "an unusable club record withholds publication instead of publishing a broken event",
    );
  } finally {
    await store.mongoClient?.close();
    await mongo.stop();
  }
});

test("public suppliers cannot commit a record that later reads cannot represent", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  useDisposableStorage(mongo.getUri(), "supplier_commit_test");
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const coordinator = await import("../apps/backend/src/coordinator.js");
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  const event = (id: string, patch: Record<string, unknown> = {}) => ({
    id, title: "Campus performance", description: "Music", start: future, end: null,
    timezone: "America/New_York", location: null, organizer: null, categories: ["Arts & music"],
    sources: [{ source: "vt-events", sourceId: id, url: `https://calendar.vt.edu/events/${id}`, fetchedAt: "2026-09-19T12:00:00Z" }],
    updatedAt: "2026-09-19T12:00:00Z", status: "scheduled", mode: "live",
    timeTBD: false, allDay: false, endEstimated: false, ...patch,
  });
  try {
    await coordinator.restoreSources();
    // A supplier hands over one healthy record, one legacy-null record and one
    // that cannot be represented at all.
    await coordinator.replaceSourceSnapshot("vt-events", [
      event("ok"),
      event("legacy", { registrationUrl: null, address: null, admission: { currency: null } }),
      event("broken", { start: "whenever" }),
    ] as never[], []);

    const stored = await store.database().collection("events")
      .find({}, { projection: { _id: 0 } }).toArray();
    assert.deepEqual(stored.map((e) => e.id).sort(), ["legacy", "ok"]);
    for (const doc of stored) {
      assert.ok(parseStoredEvent(doc), "every committed record must validate on read");
      // The legacy placeholder is written back absent, not as a null.
      assert.equal("registrationUrl" in doc, false);
      assert.equal("address" in doc, false);
    }
    assert.equal(coordinator.unreadableRecords >= 1, true, "the excluded record is counted");

    // A supplier with nothing usable is reported, never committed as an empty
    // authoritative snapshot that would erase the previous records.
    await assert.rejects(
      coordinator.replaceSourceSnapshot("vt-events", [event("all-bad", { start: "whenever" })] as never[], []),
      /no validated records/,
    );
    assert.equal(
      (await store.database().collection("events").countDocuments()) >= 2,
      true,
      "prior records survive a failed snapshot",
    );

    // Deadlines take the same gate.
    const deadline = (id: string, patch: Record<string, unknown> = {}) => ({
      id, title: "Add/drop", description: "Deadline", dueDate: "2027-01-20",
      timezone: "America/New_York",
      sources: [{ source: "vt-events", sourceId: id, url: "https://www.registrar.vt.edu/x.html", fetchedAt: "2026-09-19T12:00:00Z" }],
      updatedAt: "2026-09-19T12:00:00Z", status: "active", ...patch,
    });
    await coordinator.replaceSourceSnapshot("registrar", [], [
      deadline("d-ok"),
      deadline("d-legacy", { term: null, submissionUrl: null, dueAt: null }),
      deadline("d-broken", { dueDate: "2027-02-30" }),
    ] as never[]);
    const snapshot = await store.database().collection("source_snapshots").findOne({ source: "registrar" });
    assert.deepEqual((snapshot!.deadlines as { id: string }[]).map((d) => d.id).sort(), ["d-legacy", "d-ok"]);
    for (const stored of snapshot!.deadlines as unknown[])
      assert.ok(parseStoredDeadline(stored), "every committed deadline must validate on read");
  } finally {
    await store.mongoClient?.close();
    await mongo.stop();
  }
});
