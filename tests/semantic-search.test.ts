import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createSemanticSearch } from "../apps/backend/src/semantic-search.js";
import { semanticEmbedding } from "../apps/backend/src/semantic-embedding.js";
import type { CampusEvent, SemanticEmbeddingProvider, SemanticIndexRepository } from "../packages/shared/src/contracts.js";
import { testEvents } from "./fixtures/events.js";
const vector = (axis: number) => Array.from({ length: 768 }, (_, i) => i === axis ? 1 : 0);
const fixture = testEvents()[0];
const event = (id: string, title: string): CampusEvent => ({ ...fixture, id, title, description: "", location: null, organizer: undefined,
  categories: [], status: "scheduled", visibility: { kind: "public" }, sources: [{ ...fixture.sources[0], source: "gobblerconnect" }] });

test("semantic retrieval matches meaning, caches revisions, and never widens visibility or archives Discord", async () => {
  const cache = new Map<string, number[]>(), calls: { texts: string[]; task: string }[] = [];
  let allow = true;
  const repo: SemanticIndexRepository = {
    async read(keys) { return keys.filter(k => cache.has(k)).map(key => ({ key, vector: cache.get(key)! })); },
    async put(rows) { rows.forEach(r => cache.set(r.key, r.vector)); },
    async prune(keys) { for (const key of cache.keys()) if (!keys.includes(key)) cache.delete(key); },
    async reserve() { return allow; }, async acquire() { return true; }, async release() {}, async forgetUser() {},
  };
  const provider: SemanticEmbeddingProvider = { ready: true, async embed(texts, task) {
    calls.push({ texts, task });
    return texts.map(t => vector(/hiking|nature|outside|trail/i.test(t) ? 0 : 1));
  } };
  const search = createSemanticSearch(provider, repo);
  const hiking = event("hike", "Trail exploration"), career = event("career", "Recruiter networking");
  const hidden = { ...event("private", "Hiking secret"), visibility: { kind: "user" as const, userId: "other" } };
  const discord = { ...event("discord", "Nature club"), sources: [{ ...hiking.sources[0], source: "discord" as const }] };
  await search.index([hiking, career, hidden, discord]);
  assert.equal(cache.size, 2);
  assert.ok(calls.every(c => c.texts.every(t => !/secret|Nature club/.test(t))));
  await search.index([hiking, career, hidden]);
  assert.equal(calls.length, 1, "unchanged source revisions must not spend again");
  const result = await search.search("something outside", [hiking, career, hidden, discord], "user-a");
  assert.deepEqual(new Set(result.ids), new Set(["hike", "discord"]));
  assert.equal(result.status, "ready");
  assert.equal(cache.size, 2, "Discord embeddings stay request-local");
  assert.deepEqual((await search.search("outside", [career], "user-a")).ids, [], "withdrawn event must disappear despite cached vector");
  const revised = { ...hiking, title: "Recruiter interviews" };
  assert.equal((await search.search("outside", [revised], "user-a")).status, "partial", "old vector cannot represent edited content");
  await search.index([revised, career]);
  assert.deepEqual((await search.search("outside", [revised, career], "user-a")).ids, []);
  allow = false;
  assert.equal((await search.search("outside", [revised], "user-a")).status, "unavailable");
  const disabled = createSemanticSearch({ ...provider, ready: false }, repo);
  assert.equal((await disabled.search("outside", [hiking], "user-a")).status, "unavailable");
  assert.equal((await search.search("outside", [hidden], "user-a")).total, 0);
});

test("embedding adapter uses bounded retrieval vectors and rejects malformed/provider responses", async () => {
  const before = { ...process.env }, original = globalThis.fetch;
  process.env.GEMINI_API_KEY = "synthetic"; process.env.GEMINI_FREE_TIER_CONFIRMED = "true";
  delete process.env.SEMANTIC_SEARCH_ENABLED;
  try {
    let payload = "";
    globalThis.fetch = async (_url, init) => { payload = String(init?.body); return Response.json({ embeddings: [{ values: vector(0) }, { values: vector(1) }] }); };
    const vectors = await semanticEmbedding.embed(["hiking", "careers"], "document");
    assert.equal(vectors.length, 2);
    assert.match(payload, /RETRIEVAL_DOCUMENT/);
    assert.doesNotMatch(payload, /tools|synthetic/);
    globalThis.fetch = async () => Response.json({ embeddings: [{ values: [1, 2] }] });
    await assert.rejects(semanticEmbedding.embed(["hiking"], "query"));
    globalThis.fetch = async () => new Response("limited", { status: 429 });
    await assert.rejects(semanticEmbedding.embed(["hiking"], "query"));
    process.env.GEMINI_FREE_TIER_CONFIRMED = "false";
    await assert.rejects(semanticEmbedding.embed(["hiking"], "query"));
  } finally { globalThis.fetch = original; for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]; Object.assign(process.env, before); }
});

test("semantic reservations are atomic, scoped, and bounded with persistent index leases", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const { config } = await import("../apps/backend/src/config.js");
  config.mongo = mongo.getUri(); config.db = "semantic-test";
  const store = await import("../apps/backend/src/store.js");
  const { semanticRepository: repo } = await import("../apps/backend/src/semantic-store.js");
  try {
    await store.connectDB();
    assert.equal(await repo.acquire(), true); assert.equal(await repo.acquire(), false);
    await repo.release(); assert.equal(await repo.acquire(), true); await repo.release();
    const reservations = await Promise.all(Array.from({ length: 12 }, () => repo.reserve(16)));
    assert.equal(reservations.filter(Boolean).length, 10);
    assert.equal(await repo.reserve(1, "user-a"), false, "minute budget enforced across requests");
    await store.database().collection("semantic_budget").deleteMany({});
    for (let i = 0; i < 50; i++) assert.equal(await repo.reserve(1, "user-a"), true);
    assert.equal(await repo.reserve(1, "user-a"), false);
    assert.equal(await repo.reserve(1, "user-b"), true);
    await repo.forgetUser("user-a");
    assert.equal(await repo.reserve(1, "user-a"), true);
    await repo.put([{ key: "public-revision", vector: vector(0) }]);
    assert.equal((await repo.read(["public-revision"])).length, 1);
    await repo.prune([]); assert.deepEqual(await repo.read(["public-revision"]), []);
  } finally { await store.mongoClient?.close(); await mongo.stop(); }
});
