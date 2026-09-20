import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { testEvents } from "./fixtures/events.js";
const e=testEvents()[0];
test("public source commits retain other sources, deadline precision and unchanged canonical records",async()=>{
  const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  process.env.MONGODB_URI=mongo.getUri();process.env.MONGODB_DB="public-coordinator-test";
  const store=await import("../apps/backend/src/store.js");await store.connectDB();
  const coordinator=await import("../apps/backend/src/coordinator.js");
  try{
    const { publicSources } = await import("../apps/backend/src/public-source-registry.js");
    await store.database().collection("public_source_health").insertMany(publicSources.map(source => ({
      source: source.id, health: { status: "cached" }, nextCheck: Date.now() + 86400000,
    })));
    await coordinator.restoreSources();
    const database = store.database(), collection = database.collection;
    let snapshotReads = 0;
    database.collection = function(name: string, ...args: any[]) {
      if (name === "events" || name === "source_snapshots") snapshotReads++;
      return collection.call(this, name, ...args);
    } as typeof collection;
    try {
      await coordinator.refreshSources();
      assert.equal(snapshotReads, 0, "idle minute ticks must not reload full catalog snapshots");
    } finally { database.collection = collection; }
    const event={...e,id:"campus-one",sources:[{...e.sources[0],source:"vt-events" as const,sourceId:"one",providerId:"vt-events"}]};
    await coordinator.replaceSourceSnapshot("vt-events",[event]);
    const date={id:"due-one",title:"Apply",description:"Application deadline",dueDate:"2027-01-22",timezone:"America/New_York",sources:[{...event.sources[0],sourceId:"due-one",providerId:"registrar"}],updatedAt:"2026-09-19T00:00:00Z",status:"active" as const};
    await coordinator.replaceSourceSnapshot("registrar",[],[date]);
    assert.equal(coordinator.cachedEvents.length,1);assert.equal(coordinator.cachedDeadlines.length,1);assert.equal(coordinator.cachedDeadlines[0].dueAt,undefined);
    const before=await store.database().collection("events").findOne({id:"campus-one"});
    await coordinator.replaceSourceSnapshot("vt-events",[{...event,updatedAt:"2030-01-01T00:00:00Z"}]);
    const after=await store.database().collection("events").findOne({id:"campus-one"});assert.deepEqual(after,before);
    await assert.rejects(coordinator.replaceSourceSnapshot("registrar",[e]));
    await assert.rejects(coordinator.replaceSourceSnapshot("vt-events",[]));
    assert.equal(coordinator.cachedEvents.length,1);
    await coordinator.replaceSourceSnapshot("vt-events",[{...event,start:"2027-01-22T05:00:00Z",end:null,timeTBD:true,timeDetails:{precision:"date_only",startDate:"2027-01-22"}}]);
    assert.equal(coordinator.liveEvents(Date.parse("2027-01-23T04:59:00Z")).length,1);
    assert.equal(coordinator.liveEvents(Date.parse("2027-01-23T05:01:00Z")).length,0);
  }finally{await store.mongoClient?.close();await mongo.stop();}
});
