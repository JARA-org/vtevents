import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

test("account email encrypts and retries delivery; reset is single-use and revokes sessions", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.RESEND_API_KEY = "test-key";
  process.env.AUTH_EMAIL_FROM = "Gobbler <accounts@example.test>";
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const { createApp } = await import("../apps/backend/src/app.js");
  const { queueAccountEmail, flushAccountEmail } =
    await import("../apps/backend/src/account-email.js");
  const { unseal } = await import("../apps/backend/src/security.js");
  const app = createApp(),
    agent = request.agent(app),
    origin = process.env.APP_ORIGIN;
  const rows = store.database().collection("account_email_outbox");
  const oldFetch = globalThis.fetch;
  try {
    const signup = await agent
      .post("/api/auth/sign-up/email")
      .set("Origin", origin)
      .send({
        name: "Mail Test",
        email: "mail@example.test",
        password: "Initial-Password-123!",
      });
    assert.equal(signup.status, 200);
    const verifyRow = await rows.findOne({});
    assert.ok(verifyRow);
    assert.doesNotMatch(JSON.stringify(verifyRow), /mail@example|token=/);
    const verify = unseal<{ to: string; url: string; kind: "verify" }>(
      verifyRow.encrypted,
    );
    await queueAccountEmail(verify.to, verify.url, verify.kind);
    assert.equal(await rows.countDocuments(), 1);
    await assert.rejects(
      queueAccountEmail(verify.to, "https://foreign.test/token", "reset"),
    );
    const keys: string[] = [];
    globalThis.fetch = async (_input, init) => {
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      return new Response("{}", { status: keys.length === 1 ? 503 : 200 });
    };
    await flushAccountEmail();
    assert.equal(await rows.countDocuments(), 1);
    await rows.updateMany({}, { $set: { nextAttempt: new Date(0) } });
    await flushAccountEmail();
    assert.equal(await rows.countDocuments(), 0);
    assert.equal(keys[0], keys[1]);
    const verifyUrl = new URL(verify.url);
    assert.equal(
      (await request(app).get(verifyUrl.pathname + verifyUrl.search)).status <
        400,
      true,
    );
    assert.equal(
      (await store.database().collection("user").findOne({ email: verify.to }))
        ?.emailVerified,
      true,
    );
    const body = { email: verify.to, redirectTo: "/recover" };
    const reset = await request(app)
      .post("/api/auth/request-password-reset")
      .set("Origin", origin)
      .send(body);
    assert.equal(reset.status, 200);
    const unknown = await request(app)
      .post("/api/auth/request-password-reset")
      .set("Origin", origin)
      .send({ ...body, email: "absent@example.test" });
    assert.equal(unknown.status, reset.status);
    assert.deepEqual(unknown.body, reset.body);
    const resetRow = await rows.findOne({});
    assert.ok(resetRow);
    const resetLink = new URL(unseal<{ url: string }>(resetRow.encrypted).url);
    const redirect = await request(app).get(
      resetLink.pathname + resetLink.search,
    );
    const token = new URL(redirect.headers.location, origin).searchParams.get(
      "token",
    );
    assert.ok(token);
    const change = { token, newPassword: "Replacement-Password-123!" };
    assert.equal(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .set("Origin", origin)
          .send(change)
      ).status,
      200,
    );
    assert.equal((await agent.get("/api/me")).status, 401);
    assert.notEqual(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .set("Origin", origin)
          .send(change)
      ).status,
      200,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/auth/sign-in/email")
          .set("Origin", origin)
          .send({ email: verify.to, password: change.newPassword })
      ).status,
      200,
    );
    await rows.updateMany({}, { $set: { expiresAt: new Date(0) } });
    await flushAccountEmail();
    assert.equal(await rows.countDocuments(), 0);
  } finally {
    globalThis.fetch = oldFetch;
    await store.mongoClient?.close();
    await mongo.stop();
  }
});
