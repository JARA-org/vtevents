import { testEvents } from "./fixtures/events.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { emptyProfile } from "../apps/backend/src/domain.js";

test("authenticated API isolation, CSRF, persistence, connection retirement and authenticated discovery", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_ORIGIN = "http://localhost:3000";
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const { createApp } = await import("../apps/backend/src/app.js");
  const originalCwd = process.cwd();
  const fixtureRoot = mkdtempSync(join(tmpdir(), "gobbler-http-assets-"));
  const fixturePublic = join(fixtureRoot, "apps/frontend/dist");
  mkdirSync(fixturePublic, { recursive: true });
  writeFileSync(
    join(fixturePublic, "index.html"),
    "<!doctype html><title>Gobbler test</title>",
  );
  // Public HTML regression fixture; independent of an Expo build. Only app
  // construction needs the fixture cwd; request handlers retain its absolute path.
  let app: ReturnType<typeof createApp>;
  try {
    process.chdir(fixtureRoot);
    app = createApp();
  } finally {
    process.chdir(originalCwd);
  }
  const a = request.agent(app),
    b = request.agent(app),
    origin = "http://localhost:3000";
  try {
    const health = await request(app).get("/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.body.database, true);
    assert.equal(health.headers["cache-control"], "no-store");
    const originalCommand = store.database().command;
    store.database().command = async () => {
      throw new Error("synthetic-private-db-uri");
    };
    try {
      const unavailable = await request(app).get("/api/health");
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.body.ok, false);
      assert.equal(unavailable.body.database, false);
      assert.doesNotMatch(unavailable.text, /synthetic-private-db-uri/);
    } finally {
      store.database().command = originalCommand;
    }
    const landing = await request(app).get("/");
    assert.equal(landing.status, 200);
    assert.match(landing.headers["cache-control"], /no-cache|max-age=0/);
    const unauth = await request(app).get("/api/me");
    assert.equal(unauth.status, 401);
    assert.equal(
      (
        await request(app)
          .post("/api/narration")
          .set("Origin", origin)
          .send({ eventIds: ["demo-1"] })
      ).status,
      401,
    );
    for (const [agent, name] of [
      [a, "Student A"],
      [b, "Student B"],
    ] as const) {
      const result = await agent
        .post("/api/auth/sign-up/email")
        .set("Origin", origin)
        .send({
          name,
          email: name.replace(/ /g, "").toLowerCase() + "@example.test",
          password: "TestOnly-Long-Password-123!",
        });
      assert.equal(result.status, 200, JSON.stringify(result.body));
    }
    const pa = {
      ...emptyProfile,
      name: "Private A",
      interests: ["Outdoors"],
      onboarded: true,
    };
    assert.equal(
      (await a.put("/api/profile").set("Origin", origin).send(pa)).status,
      200,
    );
    assert.equal((await a.get("/api/me")).body.profile.name, "Private A");
    assert.equal((await b.get("/api/me")).body.profile.name, "Student B");
    assert.equal(
      (
        await a
          .put("/api/profile")
          .set("Origin", "https://evil.example")
          .send(pa)
      ).status,
      403,
    );
    for (const path of [
      "/api/events",
      "/api/deadlines",
      "/api/public-memory?q=workshop",
      "/api/events/live-test-1/ics",
      "/api/recommendations",
    ]) {
      assert.equal((await request(app).get(path)).status, 401);
    }
    for (const path of [
      "/api/discovery",
      "/api/timeline",
      "/api/profile/validate",
      "/api/availability/preview",
    ]) {
      assert.equal(
        (await request(app).post(path).set("Origin", origin).send({})).status,
        401,
      );
    }
    assert.equal((await a.get("/api/events?mode=demo")).status, 400);
    assert.equal(
      (
        await a
          .post("/api/demo/assistant")
          .set("Origin", origin)
          .send({ query: "test" })
      ).status,
      404,
    );
    const live = await a.get("/api/events");
    assert.equal(live.status, 200);
    assert.ok(live.body.events.every((e: any) => e.mode === "live"));
    const bootstrap = await request(app).get("/api/bootstrap");
    assert.equal(bootstrap.body.contractVersion, 5);
    assert.equal("demoProfile" in bootstrap.body, false);
    assert.ok(bootstrap.body.categories.includes("Sports"));
    const forged = await a
      .post("/api/discovery")
      .set("Origin", origin)
      .send({ profile: emptyProfile, saved: ["forged"] });
    assert.equal(forged.status, 400);
    const validated = await a
      .post("/api/profile/validate")
      .set("Origin", origin)
      .send({ ...pa, name: "Draft only" });
    assert.equal(validated.status, 200);
    assert.equal(validated.body.name, "Draft only");
    assert.equal((await a.get("/api/me")).body.profile.name, "Private A");
    assert.equal(
      (
        await a
          .post("/api/availability/preview")
          .set("Origin", origin)
          .send({
            profile: emptyProfile,
            block: {
              kind: "dated",
              date: "2026-09-25",
              start: "19:00",
              end: "17:00",
            },
          })
      ).status,
      410,
    );
    assert.equal(
      (
        await a
          .put("/api/saved/demo-1")
          .set("Origin", origin)
          .send({ saved: true })
      ).status,
      404,
    );
    const me = (await a.get("/api/me")).body;
    assert.equal(
      (
        await a
          .post("/api/narration")
          .set("Origin", origin)
          .send({ eventIds: ["demo-1"] })
      ).status,
      404,
    );
    assert.equal(
      (
        await a
          .post("/api/narration")
          .set("Origin", origin)
          .send({ eventIds: ["demo-1"], text: "arbitrary private text" })
      ).status,
      400,
    );
    const db = store.database();
    const coordinator = await import("../apps/backend/src/coordinator.js");
    await coordinator.restoreSources();
    const event = {
      ...testEvents()[0],
      id: "live-test-1",
      mode: "live" as const,
      sources: [
        {
          source: "gobblerconnect" as const,
          sourceId: "test-1",
          url: "https://gobblerconnect.vt.edu/events",
          fetchedAt: new Date().toISOString(),
        },
      ],
    };
    const removed = {
      ...event,
      id: "removed",
      title: "Removed event",
      sources: [{ ...event.sources[0], sourceId: "removed" }],
    };
    await coordinator.replaceSourceSnapshot("gobblerconnect", [event, removed]);
    await coordinator.replaceSourceSnapshot("gobblerconnect", [event]);
    assert.equal(
      await db.collection("events").countDocuments({ id: "removed" }),
      0,
    );
    assert.equal(
      (
        await db
          .collection("source_snapshots")
          .findOne({ source: "gobblerconnect" })
      )?.events.length,
      1,
    );
    assert.equal(
      (
        await a
          .put("/api/saved/live-test-1")
          .set("Origin", origin)
          .send({ saved: true })
      ).status,
      200,
    );
    assert.deepEqual((await a.get("/api/me")).body.saved, ["live-test-1"]);
    assert.deepEqual((await b.get("/api/me")).body.saved, []);
    await db.collection("private_context").insertOne({
      userId: me.user.id,
      provider: "canvas",
      encrypted: (await import("../apps/backend/src/security.js")).seal({
        courses: [{ id: "private", name: "Private course" }],
      }),
      syncedAt: new Date(),
    });
    assert.equal((await b.get("/api/private-context")).status, 410);
    assert.equal((await a.get("/api/private-context")).status, 410);
    const exportEffectsBefore = await db.collection("outbox").countDocuments();
    const ics = await a.get("/api/events/live-test-1/ics");
    assert.equal(ics.status, 410);
    assert.equal(ics.body.code, "FEATURE_RETIRED");
    assert.equal(ics.headers["content-disposition"], undefined);
    assert.doesNotMatch(ics.text, /BEGIN:VCALENDAR/);
    assert.equal((await a.get("/api/events/missing/ics")).status, 410);
    assert.equal((await a.post("/api/analytics").set("Origin", origin).send({ kind: "calendar_addition", eventId: "live-test-1" })).status, 400);
    assert.equal(await db.collection("outbox").countDocuments(), exportEffectsBefore);
    const discover = await a
      .post("/api/discovery")
      .set("Origin", origin)
      .send({ category: "Outdoors" });
    assert.equal(discover.status, 200);
    assert.equal(discover.body.savedRecommendations[0].event.id, "live-test-1");
    const otherDiscovery = await b
      .post("/api/discovery")
      .set("Origin", origin)
      .send({});
    assert.deepEqual(otherDiscovery.body.savedRecommendations, []);
    const timelineEffectCollections = [
      "saved",
      "feedback",
      "outbox",
      "calendar_writes",
      "oauth_states",
    ];
    const beforeTimeline = await Promise.all(
      timelineEffectCollections.map((name) =>
        db.collection(name).countDocuments(),
      ),
    );
    const week = await a.post("/api/timeline").set("Origin", origin).send({});
    assert.equal(week.status, 200);
    assert.equal(week.body.days.length, 7);
    assert.deepEqual(week.body.items, []);
    const range = { startDate: week.body.days[0], endDate: week.body.days[6] };
    const timelineA = await a
      .post("/api/timeline")
      .set("Origin", origin)
      .send(range);
    const timelineB = await b
      .post("/api/timeline")
      .set("Origin", origin)
      .send(range);
    assert.equal(timelineA.status, 200);
    assert.equal(timelineB.status, 200);
    assert.deepEqual(timelineA.body.items[0].matchedInterests, ["Outdoors"]);
    assert.deepEqual(timelineB.body.items[0].matchedInterests, []);
    assert.equal(
      JSON.stringify(timelineB.body).includes("Private course"),
      false,
    );
    assert.equal(
      (
        await a
          .post("/api/timeline")
          .set("Origin", origin)
          .send({ ...range, userId: "forged" })
      ).status,
      400,
    );
    assert.equal(
      (
        await a
          .post("/api/timeline")
          .set("Origin", "https://evil.example")
          .send(range)
      ).status,
      403,
    );
    assert.equal(
      (
        await a
          .post("/api/timeline")
          .set("Origin", origin)
          .send({ startDate: range.endDate, endDate: range.startDate })
      ).status,
      400,
    );
    assert.deepEqual(
      await Promise.all(
        timelineEffectCollections.map((name) =>
          db.collection(name).countDocuments(),
        ),
      ),
      beforeTimeline,
      "timeline queries have no domain writes",
    );
    const assistant = await a
      .post("/api/assistant")
      .set("Origin", origin)
      .send({ query: "Outdoors" });
    assert.equal(assistant.status, 200);
    assert.ok(
      assistant.body.recommendations.every(
        (r: any) => r.event.id === "live-test-1",
      ),
    );
    const savedFetch = globalThis.fetch;
    // Even installed credentials and stale clients cannot reach a retired provider.
    await db.collection("connections").insertOne({ userId: me.user.id,
      provider: "google", status: "connected", encrypted: "retired-secret" });
    let providerCalls = 0;
    globalThis.fetch = async () => { providerCalls++; throw new Error("Unexpected provider call"); };
    try {
      const routes = [
        ["get", "/api/connections"], ["get", "/api/private-context"],
        ["post", "/api/calendar"],
        ...["google", "canvas"].flatMap(provider => [
          ["post", `/api/connections/${provider}/connect`],
          ["get", `/api/connections/${provider}/callback?state=forged&code=bogus`],
          ["post", `/api/connections/${provider}/sync`],
          ["delete", `/api/connections/${provider}`],
        ]),
      ];
      for (const [method, path] of routes) {
        const invoke = (agent: any) => agent[method](path).set("Origin", origin)
          .send(method === "get" ? undefined : { destination: "google", eventId: event.id, confirmed: true });
        assert.equal((await invoke(request(app))).status, 401);
        for (let attempt = 0; attempt < 2; attempt++) {
          const retired = await invoke(a);
          assert.equal(retired.status, 410, path);
          assert.doesNotMatch(retired.text, /retired-secret|Private course/);
        }
      }
      assert.equal(providerCalls, 0);
      assert.equal(await db.collection("calendar_writes").countDocuments(), 0);
      assert.equal(await db.collection("oauth_states").countDocuments(), 0);
      const oldBusy = { id: "retired-busy", start: event.start,
        end: event.end, source: "google" };
      await db.collection("profiles").updateOne({ userId: me.user.id }, { $set: { busy: [oldBusy] } });
      assert.equal("busy" in (await a.get("/api/me")).body.profile, false);
      const clean = await a.post("/api/discovery").set("Origin", origin).send({});
      assert.equal(clean.status, 200);
      assert.equal("fit" in clean.body.savedRecommendations[0], false);
      assert.equal("schedule" in clean.body, false);
      assert.equal((await a.put("/api/profile").set("Origin", origin)
        .send({ ...pa, busy: [oldBusy], recurring: [{ kind: "free" }] })).status, 200);
      const stored = await db.collection("profiles").findOne({ userId: me.user.id });
      assert.deepEqual(stored!.busy, []);
      assert.deepEqual(stored!.recurring, []);
    } finally { globalThis.fetch = savedFetch; }
    const { askGobbler } = await import("../apps/backend/src/assistant.js");
    process.env.GEMINI_API_KEY = "synthetic-test-key";
    const aiProfile = { ...emptyProfile, aiEnabled: true, assistantConsentVersion: 1 as const };
    process.env.GEMINI_FREE_TIER_CONFIRMED = "true";
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    try {
      const answer = await askGobbler(
        "campus events",
        [event],
        aiProfile,
        [],
        {},
        { userId: me.user.id },
      );
      assert.equal(answer.engine, "deterministic");
      assert.match(answer.notice, /unavailable/);
      assert.ok(answer.recommendations.every((r) => r.event.id === event.id));
      globalThis.fetch = async (_url, init) => {
        const input = JSON.parse(String(init?.body));
        const contents = JSON.stringify(input.contents);
        assert.ok(contents.includes(event.id));
        assert.ok(!contents.includes("Private course"));
        assert.ok(!contents.includes("Private A"));
        return Response.json({
          candidates: [
            {
              content: {
                role: "model",
                parts: [
                  {
                    text: JSON.stringify({
                      intent: "events", answer: "Here is a current event to explore.", today: false, tomorrow: false, weekend: false, memoryEvidence: null,
                      weekday: null,
                      afterHour: null,
                      category: null,
                      rankedIds: [event.id],
                    }),
                  },
                ],
              },
            },
          ],
        });
      };
      const matched = await askGobbler(
        "campus events",
        [event],
        aiProfile,
        [],
        {},
        { userId: me.user.id },
      );
      assert.equal(matched.engine, "gemini");
      assert.deepEqual(
        matched.recommendations.map((r) => r.event.id),
        [event.id],
      );
      globalThis.fetch = async () =>
        Response.json({
          candidates: [
            {
              content: {
                role: "model",
                parts: [
                  {
                    text: JSON.stringify({
                      intent: "events", answer: "Here is a current event to explore.", today: false, tomorrow: false, weekend: false, memoryEvidence: null,
                      weekday: null,
                      afterHour: null,
                      category: null,
                      rankedIds: ["invented-id"],
                    }),
                  },
                ],
              },
            },
          ],
        });
      const invented = await askGobbler(
        "campus events",
        [event],
        aiProfile,
        [],
        {},
        { userId: me.user.id },
      );
      assert.equal(invented.engine, "deterministic");
      assert.ok(invented.recommendations.every((r) => r.event.id === event.id));
      process.env.GEMINI_DAILY_LIMIT = "0";
      const limited = await askGobbler(
        "campus events",
        [event],
        aiProfile,
        [],
        {},
        { userId: me.user.id },
      );
      assert.match(limited.notice, /limit/);
      assert.equal(await db.collection("assistant_budget").countDocuments(), 3);
    } finally {
      globalThis.fetch = savedFetch;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_FREE_TIER_CONFIRMED;
      delete process.env.GEMINI_DAILY_LIMIT;
    }
    assert.equal(
      (
        await a
          .delete("/api/account")
          .set("Origin", origin)
          .send({ confirmation: "DELETE" })
      ).status,
      200,
    );
    assert.equal((await a.get("/api/me")).status, 401);
    assert.equal((await b.get("/api/me")).status, 200);
    const { pseudonym } = await import("../apps/backend/src/security.js");
    const { track, eraseAnalytics } =
      await import("../apps/backend/src/analytics.js");
    const deletedKey = pseudonym(me.user.id);
    assert.ok(
      await db
        .collection("analytics_deletions")
        .findOne({ pseudonym: deletedKey }),
    );
    await track(me.user.id, "save", "live-test-1");
    assert.equal(
      await db.collection("outbox").countDocuments({ pseudonym: deletedKey }),
      0,
    );
    let analyticsNetworkCalls = 0;
    globalThis.fetch = async () => {
      analyticsNetworkCalls++;
      throw new Error("Analytics must remain local");
    };
    try {
      const remainingUser = (await b.get("/api/me")).body.user.id;
      const remainingKey = pseudonym(remainingUser);
      await track(remainingUser, "event_view", "live-test-1");
      const local = await db
        .collection("outbox")
        .findOne({ pseudonym: remainingKey, kind: "event_view" });
      assert.ok(local);
      assert.equal(local.nextAttempt, undefined);
      assert.equal(local.attempts, undefined);
      await Promise.all([
        ...Array.from({ length: 12 }, () =>
          track(remainingUser, "save", "live-test-1"),
        ),
        eraseAnalytics(remainingUser),
      ]);
      await track(remainingUser, "save", "live-test-1");
      assert.equal(
        await db
          .collection("outbox")
          .countDocuments({ pseudonym: remainingKey }),
        0,
      );
      assert.equal(analyticsNetworkCalls, 0);
    } finally {
      globalThis.fetch = savedFetch;
    }
    assert.equal(
      await db
        .collection("private_context")
        .countDocuments({ userId: me.user.id }),
      0,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    await store.mongoClient?.close();
    await mongo.stop();
  }
});
