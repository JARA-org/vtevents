import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";

test("calendar sync rejects incomplete data and cannot restore a disconnected calendar", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const { seal, unseal } = await import("../apps/backend/src/security.js");
  const { syncCalendar, disconnect, tokenFor, startOAuth, finishOAuth } =
    await import("../apps/backend/src/integrations.js");
  const db = store.database(),
    savedFetch = globalThis.fetch;
  // Synthetic fixtures only; never contacts providers or changes real accounts.
  const connect = async (userId: string, expired = false) => {
    await db.collection("connections").updateOne(
      { userId, provider: "google" },
      {
        $set: {
          encrypted: seal({
            access_token: "synthetic",
            refresh_token: "synthetic-refresh",
            expiresAt: expired ? 0 : Date.now() + 3600000,
          }),
          status: "connected",
        },
      },
      { upsert: true },
    );
  };
  try {
    await connect("owner");
    await connect("other");
    await db.collection("private_context").insertOne({
      userId: "owner",
      provider: "google",
      encrypted: seal({ busy: [{ id: "preserve" }] }),
    });
    for (const payload of [
      {},
      { calendars: { primary: {} } },
      { calendars: { primary: { busy: [{ start: "bad", end: "bad" }] } } },
    ]) {
      globalThis.fetch = async () => Response.json(payload);
      await assert.rejects(
        syncCalendar("owner", "google"),
        /incomplete availability/,
      );
      assert.equal(
        unseal(
          (await db.collection("private_context").findOne({ userId: "owner" }))!
            .encrypted,
        ).busy[0].id,
        "preserve",
      );
    }
    globalThis.fetch = async () =>
      Response.json({ calendars: { primary: { busy: [] } } });
    assert.equal((await syncCalendar("owner", "google")).busyCount, 0);
    let release!: (r: Response) => void, started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    globalThis.fetch = async (url) => {
      if (String(url).includes("freeBusy")) {
        started();
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      return new Response(null, { status: 503 });
    };
    const pending = syncCalendar("owner", "google");
    const rejected = assert.rejects(pending, /connection changed/);
    await waiting;
    await db
      .collection("oauth_states")
      .insertOne({ userId: "owner", provider: "google" });
    assert.deepEqual(await disconnect("owner", "google"), {
      disconnected: true,
      revoked: false,
    });
    release(Response.json({ calendars: { primary: { busy: [] } } }));
    await rejected;
    assert.equal(
      await db
        .collection("private_context")
        .countDocuments({ userId: "owner" }),
      0,
    );
    assert.equal(
      await db.collection("oauth_states").countDocuments({ userId: "owner" }),
      0,
    );
    assert.equal(
      await db.collection("connections").countDocuments({ userId: "other" }),
      1,
    );

    await connect("owner", true);
    globalThis.fetch = async () => Response.json({ expires_in: 3600 });
    await assert.rejects(tokenFor("owner", "google"), /expired/);
    const invalid = await db
      .collection("connections")
      .findOne({ userId: "owner" });
    assert.equal(invalid!.status, "expired");
    assert.equal(unseal(invalid!.encrypted).access_token, "synthetic");

    // A disconnect cancels an OAuth callback whose token exchange is in flight.
    process.env.GOOGLE_CLIENT_ID = "synthetic-client";
    process.env.GOOGLE_CLIENT_SECRET = "synthetic-secret";
    const authURL = new URL(await startOAuth("callback-owner", "google"));
    let exchangeStarted!: () => void, finishExchange!: (r: Response) => void;
    const exchangeWaiting = new Promise<void>((resolve) => {
      exchangeStarted = resolve;
    });
    globalThis.fetch = async () => {
      exchangeStarted();
      return new Promise<Response>((resolve) => {
        finishExchange = resolve;
      });
    };
    const callback = finishOAuth(
      "callback-owner",
      "google",
      authURL.searchParams.get("state")!,
      "synthetic-code",
    );
    const callbackRejected = assert.rejects(callback, /cancelled or expired/);
    await exchangeWaiting;
    await disconnect("callback-owner", "google");
    finishExchange(Response.json({ access_token: "synthetic-new" }));
    await callbackRejected;
    assert.equal(
      await db
        .collection("connections")
        .countDocuments({ userId: "callback-owner" }),
      0,
    );

    // A failed old refresh must not expire a newly reconnected credential.
    globalThis.fetch = async () => {
      await connect("owner");
      return new Response(null, { status: 400 });
    };
    await assert.rejects(tokenFor("owner", "google"), /expired/);
    assert.equal(
      (await db.collection("connections").findOne({ userId: "owner" }))!.status,
      "connected",
    );
  } finally {
    globalThis.fetch = savedFetch;
    await store.mongoClient?.close();
    await mongo.stop();
  }
});
