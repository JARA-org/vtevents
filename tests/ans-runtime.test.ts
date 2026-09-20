import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { config } from "../apps/backend/src/config.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { startAnsRuntime, ansRuntime, isAnsAssistantRequest, validateAnsEvents } from "../apps/backend/src/ans-runtime.js";
import type { AnsPeerVerificationService, AnsVerifiedIdentity, CampusEvent } from "../packages/shared/src/contracts.js";

test("ANS runtime gates actual TLS sockets, forwards session only after verification, and never falls back", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gobbler-ans-runtime-"));
  const cert = readFileSync("tests/fixtures/ans-test-cert.pem", "utf8");
  const key = readFileSync("tests/fixtures/ans-test-key.pem", "utf8");
  const roles = ["discord", "coordinator", "assistant"] as const;
  writeFileSync(join(directory, "peer-pins.json"), JSON.stringify({
    peers: roles.map(role => ({ role, agentId: "11111111-1111-4111-8111-111111111111", host:"source.example.test", version:"v1.0.0", ansName:"ans://v1.0.0.source.example.test" })),
    trustedTransparencyOrigins:["https://log.example.test"],
  }));
  for (const role of roles) {
    const dir = join(directory, `${role}-1.0.0`); mkdirSync(dir);
    for (const kind of ["identity", "server"]) {
      writeFileSync(join(dir, `${kind}.key`), key);
      const bundle = {certificatePEM:cert,chainPEM:cert};
      writeFileSync(join(dir, `${kind}-certificates.json`), JSON.stringify(role === "coordinator" ? [bundle] : bundle));
    }
  }
  let calls = 0, rejectCaller = false, rejectCallee = false;
  const identity = (role: AnsVerifiedIdentity["role"]): AnsVerifiedIdentity => ({ role, agentId:"11111111-1111-4111-8111-111111111111",ansName:"ans://v1.0.0.source.example.test",fingerprint:"fixture",status:"ACTIVE",checkedAt:new Date().toISOString(),method:"mtls",tier:"badge" });
  const verifier: AnsPeerVerificationService = {
    async verifyCaller(role, evidence) { assert.equal(evidence.authorized,true); if (rejectCaller) throw new Error("revoked"); return identity(role); },
    async verifyCallee(role, host, evidence) { assert.equal(host,"source.example.test"); assert.equal(evidence.authorized,true); if (rejectCallee) throw new Error("revoked"); return identity(role); },
  };
  let handler: (req: IncomingMessage,res: ServerResponse) => void = (req,res) => {
    calls++;
    assert.equal(isAnsAssistantRequest(req), true);
    assert.equal(req.url,"/api/assistant");
    if (req.headers.cookie !== "session=valid") { res.writeHead(401).end(); return; }
    res.setHeader("content-type","application/json");
    res.end(JSON.stringify({engine:"test",notice:"",answer:"ok",recommendations:[]}));
  };
  const stop = await startAnsRuntime(directory, (req,res) => handler(req,res), verifier);
  try {
    assert.equal((await ansRuntime!.ask("hello", "session=valid")).answer,"ok");
    await assert.rejects(ansRuntime!.ask("hello", "session=invalid"));
    const before = calls;
    rejectCallee = true;
    await assert.rejects(ansRuntime!.ask("secret", "session=valid"));
    assert.equal(calls,before);
    rejectCallee = false; rejectCaller = true;
    await assert.rejects(ansRuntime!.ask("secret", "session=valid"));
    assert.equal(calls,before);
    rejectCaller = false;
    const event: CampusEvent = {id:"one",title:"Event",description:"",start:"2026-10-01T10:00:00Z",end:null,timezone:"America/New_York",location:"Campus",organizer:null,categories:["Community"],sources:[{source:"discord",sourceId:"one",url:"https://discord.com/channels/1/2/3",fetchedAt:"2026-09-20T00:00:00Z"}],updatedAt:"2026-09-20T00:00:00Z",status:"scheduled",mode:"live",timeTBD:false,allDay:false,endEstimated:false};
    assert.equal((await ansRuntime!.reconcile([event,event])).length,1);
    assert.throws(() => validateAnsEvents([{...event,visibility:{kind:"user",userId:"private"}}]));
    await assert.rejects(ansRuntime!.ask("x".repeat(4*1024*1024), "session=valid"));
    // Exercise the real route, including CSRF/origin validation, independent
    // session authentication and recursion prevention, without any model call.
    const mongo = await MongoMemoryReplSet.create({replSet:{count:1}});
    const store = await import("../apps/backend/src/store.js");
    try {
      config.mongo = mongo.getUri(); config.db = "ans_runtime_test";
      config.origin = "http://localhost:3000";
      process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
      process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
      process.env.GEMINI_API_KEY = "";
      await store.connectDB();
      const {createApp} = await import("../apps/backend/src/app.js");
      const app = createApp(); handler = app;
      const signup = await request(app).post("/api/auth/sign-up/email").set("Origin",config.origin).send({name:"ANS test",email:"ans@example.test",password:"TestOnly-Long-Password-123!"});
      assert.equal(signup.status,200);
      const cookies = signup.headers["set-cookie"] as unknown as string[];
      const cookie = cookies.map(v=>v.split(";")[0]).join("; ");
      await assert.rejects(ansRuntime!.ask("events", ""));
      const reply = await request(app).post("/api/assistant").set("Origin",config.origin).set("Cookie",cookie).send({query:"events"});
      assert.equal(reply.status,200,reply.text);
      assert.equal(reply.body.engine,"deterministic");
      const spoof = await request(app).post("/api/assistant").set("Origin",config.origin).set("X-ANS-Verified","true").send({query:"events"});
      assert.equal(spoof.status,401);
    } finally { await store.mongoClient?.close(); await mongo.stop(); }
  } finally { await stop(); rmSync(directory,{recursive:true,force:true}); }
});
