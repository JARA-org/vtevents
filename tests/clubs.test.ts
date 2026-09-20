import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { testEvents } from "./fixtures/events.js";

test("club accounts isolate events and securely consume server setup tickets", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.APP_ORIGIN = "http://localhost:3000";
  const store = await import("../apps/backend/src/store.js");
  await store.connectDB();
  const { createApp } = await import("../apps/backend/src/app.js");
  const { discordClubSetup } =
    await import("../apps/backend/src/club-accounts.js");
  const { discordBotRepository } =
    await import("../apps/backend/src/discord-bot-store.js");
  const app = createApp(),
    a = request.agent(app),
    b = request.agent(app),
    origin = process.env.APP_ORIGIN;
  const newTicket = async (guildId: string) =>
    new URL(
      (await discordClubSetup.setup({ guildId, actorId: "123" })).url,
    ).hash.split("=")[1];
  try {
    assert.equal((await request(app).get("/api/clubs/mine")).status, 401);
    assert.equal(
      (
        await request(app)
          .post("/api/clubs")
          .set("Origin", origin)
          .send({ name: "Club", requestId: "request-1" })
      ).status,
      401,
    );
    for (const [agent, name] of [
      [a, "one"],
      [b, "two"],
    ] as const)
      assert.equal(
        (
          await agent
            .post("/api/auth/sign-up/email")
            .set("Origin", origin)
            .send({
              name,
              email: `${name}@example.test`,
              password: "Long-test-password-123!",
            })
        ).status,
        200,
      );
    assert.equal(await discordClubSetup.linked("900"), false);
    const { discordCollectionRepository } =
      await import("../apps/backend/src/discord-collection-store.js");
    await store
      .database()
      .collection("discord_bot_channels")
      .insertOne({
        _id: "900:901" as never,
        guildId: "900",
        channelId: "901",
        enabled: true,
        watchFrom: "100",
        scan: { cursor: "100" },
      });
    assert.deepEqual(
      await discordCollectionRepository.channels(10),
      [],
      "unlinked watched channels cannot trigger provider reads",
    );
    await discordBotRepository.apply({
      interactionId: "100",
      guildId: "900",
      channelId: "901",
      actorId: "123",
      action: "watch",
    });
    assert.equal(
      await discordBotRepository.eligible({
        guildId: "900",
        channelId: "901",
        messageId: "999",
      }),
      false,
    );
    const token = await newTicket("900");
    const anotherToken = await newTicket("900");
    const input = {
      name: "Chess",
      requestId: "create-club-1",
      discordTicket: token,
    };
    assert.equal(
      (
        await a
          .post("/api/clubs")
          .set("Origin", "https://evil.test")
          .send(input)
      ).status,
      403,
    );
    const created = await a
      .post("/api/clubs")
      .set("Origin", origin)
      .send(input);
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.discordGuildId, "900");
    assert.equal(await discordClubSetup.linked("900"), true);
    assert.equal((await discordCollectionRepository.channels(10)).length, 1);
    assert.equal(
      (await a.post("/api/clubs").set("Origin", origin).send(input)).body.id,
      created.body.id,
    );
    assert.equal(
      (await b.get(`/api/clubs/${created.body.id}/workspace`)).status,
      403,
    );
    assert.equal((await b.get("/api/clubs/mine")).body.clubs.length, 0);
    assert.equal(
      (
        await b
          .post("/api/clubs")
          .set("Origin", origin)
          .send({ ...input, requestId: "steal-club" })
      ).status,
      409,
    );
    assert.equal(
      (await b.get("/api/clubs/mine")).body.clubs.length,
      0,
      "failed redemption rolls back club creation",
    );
    await store
      .database()
      .collection("events")
      .insertMany([
        { ...testEvents()[0], id: "owned", clubId: created.body.id },
        { ...testEvents()[0], id: "unclaimed", organizer: "Chess" },
      ]);
    const view = await a.get(`/api/clubs/${created.body.id}/workspace`);
    assert.deepEqual(
      view.body.events.map((e: any) => e.id),
      ["owned"],
      "matching club name never claims imported events",
    );
    await discordBotRepository.apply({
      interactionId: "100",
      guildId: "900",
      channelId: "901",
      actorId: "123",
      action: "watch",
    });
    assert.equal(
      await discordBotRepository.eligible({
        guildId: "900",
        channelId: "901",
        messageId: "999",
      }),
      true,
    );
    const second = (
      await b
        .post("/api/clubs")
        .set("Origin", origin)
        .send({ name: "Other", requestId: "create-other" })
    ).body;
    assert.equal(
      (
        await b
          .post("/api/clubs/discord")
          .set("Origin", origin)
          .send({ clubId: second.id, discordTicket: anotherToken })
      ).status,
      409,
    );
    assert.equal(
      (
        await b
          .post("/api/clubs/discord")
          .set("Origin", origin)
          .send({ clubId: created.body.id, discordTicket: anotherToken })
      ).status,
      403,
    );
    const expired = await newTicket("902");
    await store
      .database()
      .collection("club_discord_tickets")
      .updateOne(
        { _id: createHash("sha256").update(expired).digest("hex") as never },
        { $set: { expiresAt: new Date(0) } },
      );
    assert.equal(
      (
        await b
          .post("/api/clubs/discord")
          .set("Origin", origin)
          .send({ clubId: second.id, discordTicket: expired })
      ).status,
      400,
    );
    assert.equal(
      (
        await b
          .post("/api/clubs/discord")
          .set("Origin", origin)
          .send({ clubId: second.id, discordTicket: "0".repeat(64) })
      ).status,
      400,
    );
    const token2 = await newTicket("903");
    assert.equal(
      (
        await b
          .post("/api/clubs/discord")
          .set("Origin", origin)
          .send({ clubId: second.id, discordTicket: token2 })
      ).status,
      200,
    );
    assert.equal(
      (
        await b
          .post("/api/clubs/discord")
          .set("Origin", origin)
          .send({ clubId: second.id, discordTicket: token2 })
      ).status,
      200,
    );
    const races = await Promise.all([newTicket("904"), newTicket("904")]);
    const fresh = [request.agent(app), request.agent(app), request.agent(app)];
    for (const [i, agent] of fresh.entries())
      assert.equal(
        (
          await agent
            .post("/api/auth/sign-up/email")
            .set("X-Forwarded-For", `192.0.2.${i + 10}`)
            .set("Origin", origin)
            .send({
              name: "Fresh " + i,
              email: `fresh${i}@example.test`,
              password: "Long-test-password-123!",
            })
        ).status,
        200,
      );
    const results = await Promise.all(
      fresh.slice(0, 2).map((agent, i) =>
        agent
          .post("/api/clubs")
          .set("Origin", origin)
          .send({
            name: "Race club",
            requestId: "race-club-" + i,
            discordTicket: races[i],
          }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      await store
        .database()
        .collection("managed_clubs")
        .countDocuments({ discordGuildId: "904" }),
      1,
    );
    const existingLink = await discordClubSetup.setup({
      guildId: "900",
      actorId: "123",
    });
    assert.equal(existingLink.url, origin + "/clubs");
    assert.equal((await a.get("/api/clubs/mine")).body.canCreate, false);
    assert.equal(
      (
        await a
          .post("/api/clubs")
          .set("Origin", origin)
          .send({ name: "Second club", requestId: "second-club-request" })
      ).status,
      409,
    );
    assert.equal((await fresh[2].get("/api/clubs/mine")).body.canCreate, true);
    const simultaneous = await Promise.all(
      ["one", "two"].map((suffix) =>
        fresh[2]
          .post("/api/clubs")
          .set("Origin", origin)
          .send({
            name: "Concurrent " + suffix,
            requestId: "concurrent-" + suffix,
          }),
      ),
    );
    assert.deepEqual(simultaneous.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await fresh[2].get("/api/clubs/mine")).body.clubs.length, 1);
    const announcement = {
      guildId: "900",
      channelId: "901",
      messageId: "999",
      text: "Chess on September 25, 2099 at Squires",
      createdAt: "2099-09-01T12:00:00Z",
      editedAt: null,
      sourceUrl: "https://discord.com/channels/900/901/999",
    };
    const candidate = {
      date: "2099-09-25",
      title: "Chess",
      description: "",
      location: "Squires",
      onlineUrl: null,
      isOnline: false,
      evidence: {
        date: "September 25, 2099",
        title: "Chess",
        location: "Squires",
        online: null,
      },
    };
    await discordCollectionRepository.save(
      announcement,
      "source-1",
      candidate,
      "qualified",
    );
    const listing = await a.get("/api/events");
    const automatic = listing.body.events.find((e: any) =>
      e.sources.some((s: any) => s.source === "discord"),
    );
    assert.ok(automatic, "qualified event is published without approval");
    assert.equal(automatic.clubId, created.body.id);
    assert.equal(
      automatic.timeTBD,
      true,
      "date-only input does not invent a time",
    );
    await discordCollectionRepository.save({...announcement,text:announcement.text+" from 3:30 PM - 5:00 PM; watch through https://example.org/live"},"timed-source",candidate,"qualified");
    const timed=(await a.get("/api/events")).body.events.find((e:any)=>e.id===automatic.id);
    assert.equal(timed.start,"2099-09-25T19:30:00.000Z");
    assert.equal(timed.end,"2099-09-25T21:00:00.000Z");
    assert.equal(timed.timeTBD,false);
    assert.equal(timed.onlineUrl,"https://example.org/live");
    assert.equal(timed.location,"Squires");
    const {clubPublicationNotifications}=await import("../apps/backend/src/club-publication-email.js");
    process.env.RESEND_API_KEY="test-only";
    process.env.AUTH_EMAIL_FROM="Gobbler <events@example.test>";
    process.env.TOKEN_ENCRYPTION_KEY=randomBytes(32).toString("hex");
    const originalFetch=globalThis.fetch;
    const delivered:{body:any;key:string}[]=[];
    let fail=true;
    globalThis.fetch=async (url,options)=>{
      assert.equal(String(url),"https://api.resend.com/emails");
      delivered.push({body:JSON.parse(String(options?.body)),key:(options?.headers as Record<string,string>)["Idempotency-Key"]});
      return new Response("{}",{status:fail?503:200});
    };
    try {
      await clubPublicationNotifications.flush();
      assert.equal(delivered.length,1);
      assert.match(delivered[0].body.text,/Original announcement:/);
      assert.match(delivered[0].body.text,/3:30 PM/);
      assert.match(delivered[0].body.text,/\/clubs\?club=.+&event=discord-/);
      assert.match(delivered[0].body.to[0],/one/);
      const queued=await store.database().collection("club_publication_email_outbox").findOne({});
      assert.ok(queued?.encrypted);
      assert.ok(!queued.encrypted.includes("Chess"));
      fail=false;
      await store.database().collection("club_publication_email_outbox").updateMany({},{$set:{nextAttempt:new Date(0)}});
      await clubPublicationNotifications.flush();
      assert.equal(delivered.length,2);
      assert.deepEqual(delivered[0],delivered[1],"ambiguous delivery retries identical payload and provider key");
      await clubPublicationNotifications.flush();
      assert.equal(delivered.length,2,"successful notification is not repeated");
      assert.equal((await store.database().collection("club_publication_email_outbox").findOne({}))?.encrypted,undefined);
      await discordCollectionRepository.save({...announcement,text:announcement.text+" from 3:30 PM - 5:00 PM; watch through https://example.org/live"},"timed-source",candidate,"qualified");
      await clubPublicationNotifications.flush();
      assert.equal(delivered.length,2,"reprocessing the same revision cannot send again");
      await discordCollectionRepository.save(announcement,"withdraw-before-email",candidate,"qualified");
      await store.database().collection("discord_bot_exclusions").insertOne({_id:"900:901:999" as never});
      await clubPublicationNotifications.flush();
      assert.equal(delivered.length,2,"withdrawal before delivery suppresses email");
      await store.database().collection("discord_bot_exclusions").deleteOne({_id:"900:901:999" as never});
    } finally {globalThis.fetch=originalFetch;delete process.env.RESEND_API_KEY;delete process.env.AUTH_EMAIL_FROM;}
    let workspace = (await a.get(`/api/clubs/${created.body.id}/workspace`))
      .body;
    const edit = workspace.editableEvents[0];
    const correction = {
      ...edit,
      values: {
        ...edit.values,
        title: "Chess evening",
        onlineUrl: "https://example.org/meet",
        isOnline: true,
      },
    };
    assert.equal(
      (
        await b
          .patch(`/api/clubs/events/${edit.eventId}`)
          .set("Origin", origin)
          .send(correction)
      ).status,
      403,
    );
    assert.equal(
      (
        await a
          .patch(`/api/clubs/events/${edit.eventId}`)
          .set("Origin", origin)
          .send({
            ...correction,
            values: { ...correction.values, onlineUrl: "javascript:alert(1)" },
          })
      ).status,
      400,
    );
    assert.equal(
      (
        await a
          .patch(`/api/clubs/events/${edit.eventId}`)
          .set("Origin", origin)
          .send(correction)
      ).status,
      200,
    );
    assert.equal(
      (
        await a
          .patch(`/api/clubs/events/${edit.eventId}`)
          .set("Origin", origin)
          .send(correction)
      ).status,
      409,
      "stale edit cannot overwrite a correction",
    );
    await discordCollectionRepository.save(
      { ...announcement, text: announcement.text + " updated" },
      "source-2",
      candidate,
      "qualified",
    );
    workspace = (await a.get(`/api/clubs/${created.body.id}/workspace`)).body;
    assert.equal(
      workspace.editableEvents[0].values.title,
      "Chess evening",
      "club correction survives source updates",
    );
    assert.equal(
      workspace.editableEvents[0].eventId,
      edit.eventId,
      "source revision retains event identity",
    );
    assert.equal(
      await store.database().collection("club_event_audit").countDocuments(),
      1,
    );
    const { replaceSourceSnapshot } =
      await import("../apps/backend/src/coordinator.js");
    await replaceSourceSnapshot("gobblerconnect", testEvents());
    assert.ok(
      (await a.get("/api/events")).body.events.some(
        (e: any) => e.id === edit.eventId,
      ),
      "other feed refresh cannot erase Discord publications",
    );
    await discordCollectionRepository.save(
      { ...announcement, text: "[no-ai] " + announcement.text },
      "source-3",
      null,
      "pending",
    );
    assert.equal(
      (await a.get("/api/events")).body.events.some(
        (e: any) => e.id === edit.eventId,
      ),
      false,
      "opt-out withdraws even an owner-corrected event",
    );
    await discordCollectionRepository.save(
      announcement,
      "source-4",
      candidate,
      "qualified",
    );
    await discordCollectionRepository.remove(announcement);
    assert.equal(
      (await a.get("/api/events")).body.events.some(
        (e: any) => e.id === edit.eventId,
      ),
      false,
      "deletion withdraws the publication",
    );
    const { discordTriggerQueue } =
      await import("../apps/backend/src/discord-trigger-store.js");
    await discordTriggerQueue.enqueue({ ...announcement, guildId: "9999" }, 0);
    assert.equal(
      await discordTriggerQueue.claim(),
      null,
      "unlinked server cannot queue reads",
    );
    await discordTriggerQueue.enqueue(announcement, 0);
    const firstJob = await discordTriggerQueue.claim();
    assert.ok(firstJob);
    assert.equal(
      await discordTriggerQueue.claim(),
      null,
      "active lease prevents a second worker",
    );
    await discordTriggerQueue.enqueue(announcement, 0);
    await discordTriggerQueue.finish(firstJob);
    const newJob = await discordTriggerQueue.claim();
    assert.ok(newJob, "new edit survives completion of older work");
    assert.notEqual(newJob.revision, firstJob.revision);
    await discordTriggerQueue.finish(newJob);
    assert.equal(await discordTriggerQueue.claim(), null);
    await discordTriggerQueue.withdraw(announcement);
    await discordCollectionRepository.save(
      announcement,
      "late-worker",
      candidate,
      "qualified",
    );
    assert.equal(
      (await a.get("/api/events")).body.events.some(
        (e: any) => e.id === edit.eventId,
      ),
      false,
      "Gateway deletion prevents late extraction from resurrecting the event",
    );
  } finally {
    await store.mongoClient?.close();
    await mongo.stop();
  }
});
