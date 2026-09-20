import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type {
  CampusEvent,
  CampusDeadline,
} from "../packages/shared/src/contracts.js";

const event: CampusEvent = {
  id: "memory-event",
  title: "Past public workshop",
  description: "Public activity evidence",
  start: "2025-09-01T15:00:00Z",
  end: null,
  timezone: "America/New_York",
  location: "Library",
  organizer: "Observed club",
  categories: ["Community"],
  sources: [
    {
      source: "vt-events",
      sourceId: "one",
      url: "https://events.vt.edu/events/one.html",
      fetchedAt: "2026-09-19T00:00:00Z",
    },
  ],
  updatedAt: "2026-09-19T00:00:00Z",
  status: "scheduled",
  mode: "live",
  timeTBD: false,
  allDay: false,
  endEstimated: false,
};

test("public memory retains history idempotently, isolates scope, and distinguishes observed organizers", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const memory = await import("../apps/backend/src/public-memory.js");
  const deadline: CampusDeadline = {
    id: "memory-deadline",
    title: "Submit application",
    description: "Public deadline",
    dueDate: "2026-10-01",
    timezone: "America/New_York",
    sources: event.sources,
    updatedAt: event.updatedAt,
    status: "active",
  };
  try {
    const observation = {
      ...event,
      updatedAt: "2026-09-20T00:00:00Z",
      sources: event.sources.map((source) => ({
        ...source,
        fetchedAt: "2026-09-20T00:00:00Z",
      })),
    };
    assert.equal(
      memory.publicMemoryRevision(event),
      memory.publicMemoryRevision(observation),
    );
    assert.notEqual(
      memory.publicMemoryRevision(event),
      memory.publicMemoryRevision({ ...event, status: "cancelled" }),
    );
    assert.notEqual(
      memory.publicOrganizerMemory(event, event.updatedAt)?.id,
      memory.publicOrganizerMemory(
        {
          ...event,
          sources: [
            { ...event.sources[0], url: "https://career.vt.edu/events/one/" },
          ],
        },
        event.updatedAt,
      )?.id,
    );
    await memory.recordPublicMemory([event], [deadline]);
    const headsBefore = await store
      .database()
      .collection("public_memory_heads")
      .find()
      .sort({ _id: 1 })
      .toArray();
    const clubsBefore = await store
      .database()
      .collection("public_memory_clubs")
      .find()
      .toArray();
    await memory.recordPublicMemory([observation], [deadline]);
    assert.deepEqual(
      await store
        .database()
        .collection("public_memory_heads")
        .find()
        .sort({ _id: 1 })
        .toArray(),
      headsBefore,
      "unchanged fetches do not rewrite content or lastSeenAt",
    );
    assert.deepEqual(
      await store.database().collection("public_memory_clubs").find().toArray(),
      clubsBefore,
      "unchanged fetches do not rewrite organizer history",
    );
    assert.equal(
      await store
        .database()
        .collection("public_memory_revisions")
        .countDocuments(),
      2,
    );
    await memory.recordPublicMemory([], []);
    assert.equal(
      (await memory.searchPublicMemory("Past public")).events.length,
      1,
      "past events survive empty snapshots",
    );
    assert.equal(
      (await memory.searchPublicMemory(".*")).events.length,
      0,
      "queries are literal, not regex programs",
    );
    const all = await memory.searchPublicMemory("");
    assert.equal(all.deadlines[0].dueDate, "2026-10-01");
    assert.equal(all.clubs[0].verified, false);
    assert.equal(all.clubs[0].clubId, undefined);
    const augmented = {
      ...event,
      id: "nested-projection",
      sources: [
        { ...event.sources[0], unexpectedPrivateMetadata: "do-not-store" },
      ],
      media: [
        {
          kind: "image",
          url: "https://events.vt.edu/flyer.png",
          accountPayload: "do-not-store",
        },
      ],
      extensions: { internal: "do-not-store" },
    } as CampusEvent;
    await memory.recordPublicMemory([augmented], []);
    const nested = await store
      .database()
      .collection("public_memory_heads")
      .findOne({ "value.id": "nested-projection" });
    assert.equal(
      JSON.stringify(nested).includes("do-not-store"),
      false,
      "unknown nested fields and extension payloads are excluded",
    );
    await memory.withdrawPublicMemory([augmented.id]);
    await assert.rejects(
      memory.recordPublicMemory(
        [{ ...event, visibility: { kind: "user", userId: "private" } }],
        [],
      ),
      /private/,
    );
    await assert.rejects(
      memory.recordPublicMemory(
        [{ ...event, sources: [{ ...event.sources[0], source: "retired-private-provider" as never }] }],
        [],
      ),
      /public source/,
    );
    await assert.rejects(
      memory.recordPublicMemory(
        [
          event,
          {
            ...event,
            id: "secret",
            visibility: { kind: "channel", guildId: "g", channelId: "c" },
          },
        ],
        [],
      ),
      /private/,
    );
    assert.equal(
      await store.database().collection("public_memory_heads").countDocuments(),
      2,
      "invalid batch makes no writes",
    );
    await memory.recordPublicMemory(
      [{ ...event, status: "cancelled" }],
      [{ ...deadline, status: "withdrawn" }],
    );
    assert.equal(
      await store
        .database()
        .collection("public_memory_revisions")
        .countDocuments(),
      4,
    );
    assert.equal(
      (await memory.searchPublicMemory("")).events[0].status,
      "cancelled",
    );
    await memory.withdrawPublicMemory([event.id]);
    assert.equal((await memory.searchPublicMemory("")).events.length, 0);
    assert.equal((await memory.searchPublicMemory("")).clubs.length, 0);
    assert.equal(
      await store
        .database()
        .collection("public_memory_revisions")
        .countDocuments({ kind: "event" }),
      0,
    );
    await assert.rejects(memory.searchPublicMemory("x".repeat(201)), /200/);
  } finally {
    await store.mongoClient?.close();
    await mongo.stop();
  }
});
