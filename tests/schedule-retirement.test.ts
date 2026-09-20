import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import { emptyProfile } from "../apps/backend/src/domain.js";

test("startup removes obsolete personal blocks without changing accounts or saved events", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "retirement_test";
  const seed = new MongoClient(mongo.getUri());
  await seed.connect();
  const database = seed.db("retirement_test");
  const expected = { ...emptyProfile, userId: "owner", extensions: { "test.preferences": { preserved: true } } };
  await database.collection("profiles").insertOne({ ...expected, recurring: [{ weekday: 5 }], busy: [{ source: "manual" }] });
  await database.collection("saved").insertOne({ userId: "owner", eventId: "event" });
  const store = await import("../apps/backend/src/store.js");
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await store.connectDB();
      const profile = await database.collection("profiles").findOne({ userId: "owner" }, { projection: { _id: 0 } });
      assert.deepEqual(profile, { ...expected, recurring: [], busy: [] });
      assert.equal(await database.collection("saved").countDocuments({ userId: "owner" }), 1);
      await store.mongoClient?.close();
    }
  } finally {
    await store.mongoClient?.close();
    await seed.close();
    await mongo.stop();
  }
});
