import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { CampusEvent } from "../packages/shared/src/contracts.js";
import {
  normalizeStoredEvent,
  parseStoredEvent,
  parseStoredDeadline,
  eventSchema,
} from "../apps/backend/src/domain.js";
import { validateAnsEvents } from "../apps/backend/src/ans-runtime.js";
import { retryDelay } from "../apps/backend/src/discord-jobs.js";
import { config, HttpError } from "../apps/backend/src/config.js";

/** Importing the backend loads the developer's .env, so `config` may point at a real
 * cluster. Every storage-backed test must retarget it at its own disposable replica
 * set and prove it before connecting: these tests never touch a hosted database. */
function useDisposableStorage(uri: string, name: string) {
  config.mongo = uri;
  config.db = name;
  assert.match(
    new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).hostname,
    /^(127\.0\.0\.1|localhost|::1)$/,
    "tests must only ever connect to a local disposable database",
  );
}

const future = new Date(Date.now() + 7 * 86400000).toISOString();
function storedEvent(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    title: "Campus performance",
    description: "Music",
    start: future,
    end: null,
    timezone: "America/New_York",
    location: null,
    organizer: null,
    categories: ["Arts & music"],
    sources: [
      {
        source: "vt-events",
        sourceId: id,
        url: `https://calendar.vt.edu/events/${id}`,
        fetchedAt: "2026-09-19T12:00:00Z",
      },
    ],
    updatedAt: "2026-09-19T12:00:00Z",
    status: "scheduled",
    mode: "live",
    timeTBD: false,
    allDay: false,
    endEstimated: false,
    ...patch,
  };
}

test("legacy null placeholders are absence, real nulls survive, and unusable records are dropped", () => {
  // Written before the driver was told to ignore undefined: every absent optional
  // field became BSON null. These are exactly the shapes found in production.
  const legacy = storedEvent("legacy", {
    registrationUrl: null,
    organizerUrl: null,
    address: null,
    media: null,
    links: null,
    sports: null,
    isOnline: null,
    aliases: null,
    audience: null,
    ownerCorrected: null,
    timeTBD: null,
    allDay: null,
    endEstimated: null,
    description: null,
    timezone: null,
    admission: { price: null, currency: null, free: true, availability: null },
    timeDetails: { precision: "date_only", startDate: null, endDate: null, note: null, confirmedStart: null },
    clubId: "club-1",
    revision: "r1",
    visibility: { kind: "public" },
  });
  legacy.sources[0] = { ...legacy.sources[0], providerId: null, label: null, sourceUpdatedAt: null } as never;
  const repaired = parseStoredEvent(legacy);
  assert.ok(repaired, "a legacy record must remain usable");
  const record = repaired as CampusEvent & Record<string, unknown>;
  for (const field of ["registrationUrl", "organizerUrl", "address", "media", "links", "sports", "isOnline", "aliases", "audience", "ownerCorrected"])
    assert.equal(field in record, false, `${field} null placeholder must be removed`);
  // Nullable fields carry meaning and must not be mistaken for absence.
  assert.equal(record.end, null);
  assert.equal(record.location, null);
  assert.equal(record.organizer, null);
  assert.equal(record.sources[0].sourceUpdatedAt, null);
  assert.equal(record.timeDetails!.confirmedStart, null);
  assert.equal("startDate" in record.timeDetails!, false);
  assert.equal("providerId" in record.sources[0], false);
  assert.equal(record.admission!.free, true);
  assert.equal("price" in record.admission!, false);
  // Schema defaults fill the fields whose placeholder was removed.
  assert.equal(record.description, "");
  assert.equal(record.timezone, "America/New_York");
  assert.equal(record.timeTBD, false);
  // Fields the schema does not declare must survive validation untouched.
  assert.equal(record.clubId, "club-1");
  assert.equal(record.revision, "r1");
  assert.deepEqual(record.visibility, { kind: "public" });
  assert.equal(eventSchema.safeParse(record).success, true);

  // A record that is genuinely unrepresentable is dropped, not repaired.
  assert.equal(parseStoredEvent(storedEvent("bad", { start: "not-a-time" })), null);
  assert.equal(parseStoredEvent(storedEvent("bad", { title: null })), null);
  assert.equal(parseStoredEvent(storedEvent("bad", { sources: [] })), null);
  // Repair never invents data for a required field.
  assert.equal((normalizeStoredEvent({ id: "x", title: null }) as { title?: unknown }).title, null);

  const deadline = {
    id: "d1", title: "Add/drop", description: "Deadline", dueDate: "2027-01-20",
    timezone: null, dueAt: null, audience: null, term: null, submissionUrl: null, media: null,
    sources: [{ source: "vt-events", sourceId: "d1", url: "https://www.registrar.vt.edu/x.html", fetchedAt: "2026-09-19T12:00:00Z" }],
    updatedAt: "2026-09-19T12:00:00Z", status: "active",
  };
  const parsedDeadline = parseStoredDeadline(deadline);
  assert.ok(parsedDeadline);
  assert.equal(parsedDeadline!.timezone, "America/New_York");
  assert.equal("dueAt" in parsedDeadline!, false);
  assert.equal(parseStoredDeadline({ ...deadline, dueDate: "2027-02-30" }), null);
});

test("agent reconciliation accepts repaired records and reports internal faults as unavailable", () => {
  const legacy = storedEvent("legacy", { registrationUrl: null, address: null, admission: { availability: null } });
  const [normalized] = validateAnsEvents([legacy]);
  assert.equal("registrationUrl" in normalized, false);
  assert.equal("address" in normalized, false);
  assert.equal(eventSchema.safeParse(normalized).success, true);
  // A record that cannot be represented must not surface as a 400 "check your
  // entries": it is a server-side data fault, reported as unavailable.
  for (const broken of [
    [storedEvent("bad", { start: "not-a-time" })],
    [storedEvent("bad", { isOnline: "yes" })],
    ["not-an-object"],
  ]) {
    const error = (() => {
      try {
        validateAnsEvents(broken);
        return null;
      } catch (e) {
        return e;
      }
    })();
    assert.ok(error instanceof HttpError, "internal data faults use HttpError");
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /invalid|entries/i);
  }
  // Private records stay rejected; visibility is still enforced.
  assert.throws(() => validateAnsEvents([storedEvent("p", { visibility: { kind: "user", userId: "u" } })]));
});

test("queue backoff starts fast, escalates and stays bounded at the previous ceiling", () => {
  assert.equal(retryDelay({ attempts: 1 }), 3000);
  assert.equal(retryDelay({ attempts: 2 }), 6000);
  assert.equal(retryDelay({ attempts: 3 }), 12000);
  assert.equal(retryDelay({ attempts: 5 }), 48000);
  assert.equal(retryDelay({ attempts: 6 }), 60000);
  assert.equal(retryDelay({ attempts: 99 }), 60000);
  // An untracked or malformed attempt count must never produce an immediate or
  // negative delay that would spin the queue.
  assert.equal(retryDelay({}), 3000);
  assert.equal(retryDelay({ attempts: 0 }), 3000);
  assert.equal(retryDelay({ attempts: -5 }), 3000);
});

test("one unreadable stored record never empties the listings, and stored faults are not form errors", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  useDisposableStorage(mongo.getUri(), "stored_records_test");
  config.origin = "http://localhost:3000";
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.GEMINI_API_KEY = "";
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const coordinator = await import("../apps/backend/src/coordinator.js");
  const { createApp } = await import("../apps/backend/src/app.js");
  const origin = "http://localhost:3000";
  try {
    await store.database().collection("events").insertMany([
      storedEvent("good"),
      storedEvent("legacy", { registrationUrl: null, address: null, organizerUrl: null }),
      storedEvent("unreadable", { start: "not-a-time" }),
    ] as never[]);
    await coordinator.restoreSources();
    // The damaged record is excluded; every other record is still served.
    const ids = coordinator.cachedEvents.map((e) => e.id).sort();
    assert.deepEqual(ids, ["good", "legacy"]);
    assert.equal(coordinator.unreadableRecords, 1);

    const app = createApp();
    const agent = request.agent(app);
    const health = await request(app).get("/api/health");
    assert.equal(health.body.unreadableRecords, 1);
    const signup = await agent.post("/api/auth/sign-up/email").set("Origin", origin)
      .send({ name: "Stored test", email: "stored@example.test", password: "TestOnly-Long-Password-123!" });
    assert.equal(signup.status, 200);

    // Discovery must still answer with the readable records rather than failing.
    const discovery = await agent.post("/api/discovery").set("Origin", origin).send({ limit: 10 });
    assert.equal(discovery.status, 200);
    assert.equal(discovery.body.totalAvailable, 2);
    const events = await agent.get("/api/events");
    assert.equal(events.status, 200);
    assert.equal(events.body.events.length, 2);

    // Absent optional fields must now be stored absent, not as null.
    await store.database().collection("events").insertOne({
      ...storedEvent("written"), registrationUrl: undefined, address: undefined,
    } as never);
    const written = await store.database().collection("events").findOne({ id: "written" });
    assert.equal("registrationUrl" in (written as object), false);
    assert.equal("address" in (written as object), false);

    // A stored profile that no longer validates is reported as unavailable with a
    // message that does not blame the person's form entries.
    const me = await agent.get("/api/me");
    assert.equal(me.status, 200);
    await store.database().collection("profiles").updateOne(
      { userId: me.body.user.id },
      { $set: { userId: me.body.user.id, name: "", interests: [], recurring: [], busy: [], onboarded: true } },
      { upsert: true },
    );
    for (const call of [
      () => agent.get("/api/me"),
      () => agent.post("/api/discovery").set("Origin", origin).send({ limit: 10 }),
    ]) {
      const response = await call();
      assert.equal(response.status, 503);
      assert.doesNotMatch(response.body.message, /fields are invalid|check your entries/i);
    }

    // Genuine bad input from the browser is still a 400 with the form message.
    const badInput = await agent.post("/api/discovery").set("Origin", origin).send({ limit: 999 });
    assert.equal(badInput.status, 400);
    assert.match(badInput.body.message, /fields are invalid/i);
  } finally {
    await store.mongoClient?.close();
    await mongo.stop();
  }
});

test("a consumed revision reservation is reported as spent without reserving anything", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  useDisposableStorage(mongo.getUri(), "stored_records_budget_test");
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const { discordCollectionRepository } = await import(
    "../apps/backend/src/discord-collection-store.js"
  );
  const reservation = {
    guildId: "1", channelId: "2", messageId: "3", fingerprint: "fp-a",
    limits: { serverOnly: true, globalDaily: 20, guildDaily: 20, guildHourly: 5, messageDaily: 2 },
  };
  try {
    assert.equal(await discordCollectionRepository.extractionSpent!(reservation), false);
    assert.equal(await discordCollectionRepository.reserveExtraction(reservation), true);
    assert.equal(await discordCollectionRepository.extractionSpent!(reservation), true);
    // The second attempt for the same content is refused, matching the spent report.
    assert.equal(await discordCollectionRepository.reserveExtraction(reservation), false);
    // A different revision of the same message is unaffected, and asking never spends.
    const edited = { ...reservation, fingerprint: "fp-b" };
    assert.equal(await discordCollectionRepository.extractionSpent!(edited), false);
    assert.equal(await discordCollectionRepository.extractionSpent!(edited), false);
    assert.equal(await discordCollectionRepository.reserveExtraction(edited), true);
    const hour = await store.database().collection("discord_extraction_counters")
      .findOne({ _id: `guild:1:hour:${new Date().toISOString().slice(0, 13)}` as never });
    assert.equal(hour?.count, 2, "only real reservations consume server budget");
  } finally {
    await store.mongoClient?.close();
    await mongo.stop();
  }
});
