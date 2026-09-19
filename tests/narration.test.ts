import { testEvents } from "./fixtures/events.js";
import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";

test("voice grounding, private-data boundary, caching, budget and failures", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const { narrate, narrationText } =
    await import("../apps/backend/src/narration.js");
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_VOICE_ID;
  const originalFetch = global.fetch;
  try {
    assert.throws(() => narrationText([]), /current campus events/);
    const event = {
      ...testEvents()[0],
      mode: "live" as const,
      title: "Public campus concert",
    };
    assert.throws(
      () => narrationText([{ ...event, status: "cancelled" }]),
      /current campus events/,
    );
    await assert.rejects(narrate([event]), /not connected/);
    process.env.ELEVENLABS_API_KEY = "test-only";
    process.env.ELEVENLABS_VOICE_ID = "test-voice";
    let calls = 0;
    global.fetch = async (url, init) => {
      calls++;
      assert.match(
        String(url),
        /^https:\/\/api.elevenlabs.io\/v1\/text-to-speech\/test-voice\?/,
      );
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body).sort(), ["model_id", "text"]);
      assert.match(body.text, /Public campus concert/);
      assert.match(body.text, /Check each event's source and schedule note/);
      assert.ok(body.text.length < 1200);
      return new Response(new Uint8Array([73, 68, 51, 1, 2, 3]), {
        headers: { "content-type": "audio/mpeg" },
      });
    };
    const first = await narrate([event]);
    const second = await narrate([event]);
    assert.deepEqual(first, second);
    assert.equal(calls, 1, "repeat clicks use cached public audio");
    const budget = await store
      .database()
      .collection("voice_budget")
      .findOne({});
    assert.equal(budget?.characters, narrationText([event]).length);
    process.env.ELEVENLABS_MONTHLY_CHARACTER_LIMIT = "0";
    await assert.rejects(
      narrate([{ ...event, title: "Another event" }]),
      /voice allowance/,
    );
    assert.equal(calls, 1, "exhausted budget cannot call provider");
    process.env.ELEVENLABS_MONTHLY_CHARACTER_LIMIT = "8000";
    global.fetch = async () => {
      calls++;
      return new Response("provider-internal-error", { status: 500 });
    };
    await assert.rejects(
      narrate([{ ...event, title: "Third event" }]),
      /voice is unavailable/,
    );
    assert.equal(calls, 2, "no automatic retry of paid TTS request");
    assert.equal(
      await store.database().collection("voice_locks").countDocuments(),
      0,
    );
    assert.ok(
      (await store.database().collection("voice_budget").findOne({}))!
        .characters > budget!.characters,
      "failed requests retain their spend reservations",
    );
  } finally {
    global.fetch = originalFetch;
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
    delete process.env.ELEVENLABS_MONTHLY_CHARACTER_LIMIT;
    await store.mongoClient?.close();
    await mongo.stop();
  }
});
