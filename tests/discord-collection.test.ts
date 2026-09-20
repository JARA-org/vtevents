import test from "node:test";
import assert from "node:assert/strict";
import {
  explicitDiscordDate,
  validateDiscordCandidate,
} from "../apps/backend/src/discord-event-rules.js";
import { collectDiscordMessages } from "../apps/backend/src/discord-collector.js";
import { createDiscordReader } from "../apps/backend/src/discord-reader.js";
import { eventSchema } from "../apps/backend/src/domain.js";
import { testEvents } from "./fixtures/events.js";
import { deduplicate } from "../apps/backend/src/sources.js";
import type {
  DiscordCollectionRepository,
  DiscordCollectedMessage,
  DiscordEventCandidate,
  DiscordScanState,
} from "../packages/shared/src/contracts.js";
const text =
  "Chess night on September 25, 2026 at Squires. Join online at https://example.org/join";
const proposal: DiscordEventCandidate = {
  date: "2026-09-25",
  title: "Chess night",
  description: "",
  location: "Squires",
  onlineUrl: "https://example.org/join",
  isOnline: true,
  evidence: {
    date: "September 25, 2026",
    title: "Chess night",
    location: "Squires",
    online: "Join online at https://example.org/join",
  },
};

test("existing date-only fencing proposals recover explicit clocks and viewing links from evidence", () => {
  const text="Fencing competition from 3:30 PM - 5:00 PM today. It's at Squires Auditorium, also you can watch through https://www.youtube.com/watch?v=v9QtM6qnG50.";
  const candidate={...proposal,date:"2026-09-20",dateReasoning:"Today is the original posting date in campus time",title:"Fencing competition",location:"Squires Auditorium",onlineUrl:null,isOnline:false,evidence:{date:"today",title:"Fencing competition",location:"Squires Auditorium",online:null}};
  const context={postedAt:"2026-09-20T16:00:00Z",timezone:"America/New_York"};
  const result=validateDiscordCandidate(candidate,text,context)!;
  assert.equal(result.startTime,"15:30");
  assert.equal(result.endTime,"17:00");
  assert.equal(result.onlineUrl,"https://www.youtube.com/watch?v=v9QtM6qnG50");
  assert.equal(result.isOnline,true);
  assert.equal(result.location,"Squires Auditorium");
  assert.equal(validateDiscordCandidate({...candidate,startTime:"01:00"},text.replace("3:30 PM - 5:00 PM","sometime"),context)?.startTime,undefined);
  assert.equal(validateDiscordCandidate(candidate,text.replace("3:30 PM - 5:00 PM","3:30 PM - 5:00 PM PST"),context)?.startTime,undefined);
});
test("image-only announcements qualify from bounded transcription and captions opt out before image/AI access", async () => {
  const message: DiscordCollectedMessage = {
    guildId: "1",
    channelId: "2",
    messageId: "3",
    text: "",
    createdAt: "2026-09-19T12:00:00Z",
    editedAt: null,
    sourceUrl: "https://discord.com/channels/1/2/3",
    images: [
      {
        id: "4",
        messageId: "3",
        channelId: "2",
        url: "https://cdn.discordapp.com/attachments/2/4/a.png",
        mimeType: "image/png",
        size: 8,
      },
    ],
  };
  let calls = 0,
    downloads = 0,
    saved: DiscordCollectedMessage | undefined;
  const store: DiscordCollectionRepository = {
    channels: async () => [],
    messages: async () => [message],
    unchanged: async () => false,
    save: async (m) => {
      saved = m;
    },
    remove: async () => {},
    checked: async () => {},
    checkpoint: async () => {},
    acquire: async () => true,
    release: async () => {},
    reserveAI: async () => true,
    reserveExtraction: async () => true,
  };
  const deps = {
    store,
    policy: {
      apply: async () => ({ content: "" }),
      eligible: async () => true,
    },
    reader: {
      list: async () => [],
      get: async () => message,
      images: async () => {
        downloads++;
        return [
          {
            attachmentId: "4",
            messageId: "3",
            mimeType: "image/png",
            data: "synthetic",
          },
        ];
      },
    },
    extractor: {
      propose: async () => {
        calls++;
        return {
          candidate: proposal,
          imageTexts: [{ attachmentId: "4", messageId: "3", text }],
        };
      },
    },
    dailyLimit: 20,
  };
  assert.equal((await collectDiscordMessages(deps)).qualified, 1);
  assert.equal(saved?.imageTexts?.[0].attachmentId, "4");
  message.text = "[no-ai]";
  await collectDiscordMessages(deps);
  assert.equal(calls, 1);
  assert.equal(downloads, 1);
});
test("Discord qualification requires an explicit valid full date, event text, and physical or online venue", () => {
  assert.ok(validateDiscordCandidate(proposal, text));
  assert.equal(explicitDiscordDate("September 25"), null);
  assert.equal(explicitDiscordDate("tomorrow"), null);
  assert.equal(explicitDiscordDate("February 30, 2026"), null);
  assert.equal(explicitDiscordDate("25 September 2026"), "2026-09-25");
  assert.equal(explicitDiscordDate("2026-09-25"), "2026-09-25");
  for (const change of [
    { date: "2027-09-25" },
    { title: "Made up event" },
    { description: "Invented description" },
    { location: "Invented venue" },
    { location: null, onlineUrl: null, isOnline: false },
    { onlineUrl: "javascript:alert(1)" },
    { onlineUrl: "https://evil.example" },
  ])
    assert.equal(
      validateDiscordCandidate({ ...proposal, ...change }, text),
      null,
    );
  assert.equal(validateDiscordCandidate(proposal, "[no-ai] " + text), null);
  assert.ok(
    validateDiscordCandidate({ ...proposal, location: null }, text),
    "online-only",
  );
  assert.ok(
    validateDiscordCandidate(
      { ...proposal, onlineUrl: null, isOnline: false },
      text,
    ),
    "physical-only",
  );
  assert.ok(
    validateDiscordCandidate(
      {
        ...proposal,
        location: null,
        onlineUrl: null,
        evidence: { ...proposal.evidence, online: "online" },
      },
      text,
    ),
    "online without supplied URL",
  );
});
test("online attendance is additive, coexists with physical location, and survives validation", () => {
  const event = eventSchema.parse({
    ...testEvents()[0],
    location: "Squires",
    onlineUrl: "https://example.org/join",
    isOnline: true,
  });
  assert.equal(event.location, "Squires");
  assert.equal(event.onlineUrl, "https://example.org/join");
  assert.equal(
    deduplicate([
      event,
      {
        ...testEvents()[0],
        location: "Squires",
        updatedAt: "2099-01-01T00:00:00Z",
      },
    ])[0].onlineUrl,
    event.onlineUrl,
  );
  assert.throws(() =>
    eventSchema.parse({ ...event, onlineUrl: "javascript:alert(1)" }),
  );
  assert.throws(() =>
    eventSchema.parse({
      ...event,
      onlineUrl: "https://user:password@example.org",
    }),
  );
  assert.ok(
    eventSchema.parse(testEvents()[0]),
    "old payload without new fields still valid",
  );
});
test("collector excludes before AI, caches revisions, removes deleted messages and fails closed on budget", async () => {
  const records = new Map<
    string,
    {
      fingerprint: string;
      candidate: DiscordEventCandidate | null;
      status: string;
    }
  >();
  let current: DiscordCollectedMessage | null = {
    guildId: "1",
    channelId: "2",
    messageId: "3",
    text,
    sourceUrl: "https://discord.com/channels/1/2/3",
    createdAt: "2026-09-19T00:00:00Z",
    editedAt: null,
  };
  let ai = 0,
    budget = true,
    allowed = true;
  const ref = { guildId: "1", channelId: "2", messageId: "3" };
  const store: DiscordCollectionRepository = {
    channels: async () => [],
    messages: async () => [ref],
    unchanged: async (t, f) =>
      records.get(t.messageId!)?.fingerprint === f &&
      records.get(t.messageId!)?.status !== "pending",
    save: async (m, f, c, s) => {
      records.set(m.messageId, { fingerprint: f, candidate: c, status: s });
    },
    remove: async (t) => {
      records.delete(t.messageId!);
    },
    checked: async () => {},
    checkpoint: async () => {},
    acquire: async () => true,
    release: async () => {},
    reserveAI: async () => budget,
    reserveExtraction: async () => budget,
  };
  const deps = {
    store,
    policy: {
      apply: async () => ({ content: "" }),
      eligible: async () => allowed,
    },
    reader: { list: async () => [], get: async () => current },
    extractor: {
      propose: async (
        _text: string,
        context?: { postedAt: string; timezone: string },
      ) => {
        assert.deepEqual(context, {
          postedAt: current!.createdAt,
          timezone: "America/New_York",
        });
        ai++;
        return proposal;
      },
    },
    dailyLimit: 2,
  };
  await collectDiscordMessages(deps);
  assert.equal(ai, 1);
  assert.equal(records.get("3")?.status, "qualified");
  await collectDiscordMessages(deps);
  assert.equal(ai, 1, "unchanged content must not call AI again");
  await collectDiscordMessages({
    ...deps,
    targets: [ref],
    settleMs: 0,
    store: {
      ...store,
      channels: async () => {
        throw new Error("event-driven mode cannot scan history");
      },
      messages: async () => {
        throw new Error("event-driven mode cannot scan other messages");
      },
    },
  });
  assert.equal(ai, 1, "duplicate notifications reuse the processed revision");
  current = {
    ...current!,
    text: text + " edited",
    editedAt: new Date().toISOString(),
  };
  await collectDiscordMessages(deps);
  assert.equal(ai, 1, "recent edits settle before AI");
  current = { ...current!, text: "x".repeat(6001), editedAt: null };
  await collectDiscordMessages(deps);
  assert.equal(ai, 1, "oversized input cannot spend AI budget");
  current = { ...current!, text: "[NO-AI] " + text };
  await collectDiscordMessages(deps);
  assert.equal(ai, 1);
  assert.equal(records.size, 0);
  current = { ...current!, text };
  budget = false;
  await collectDiscordMessages(deps);
  assert.equal(ai, 1);
  assert.equal(records.get("3")?.status, "pending");
  allowed = false;
  await collectDiscordMessages(deps);
  assert.equal(records.size, 0);
  allowed = true;
  current = null;
  await collectDiscordMessages(deps);
  assert.equal(records.size, 0);
});
test("collector checkpoints multi-page catch-up without skipping backlog", async () => {
  let scan: DiscordScanState = { cursor: "100" };
  const pages: (string | undefined)[] = [];
  const store: DiscordCollectionRepository = {
    channels: async () => [{ guildId: "1", channelId: "2", scan }],
    messages: async () => [],
    unchanged: async () => true,
    save: async () => {},
    remove: async () => {},
    checked: async () => {},
    checkpoint: async (_t, s) => {
      scan = s;
    },
    acquire: async () => true,
    release: async () => {},
    reserveAI: async () => false,
    reserveExtraction: async () => false,
  };
  const reader = {
    get: async () => null,
    list: async (_t: unknown, before?: string) => {
      pages.push(before);
      return Array.from({ length: before ? 51 : 100 }, (_, i) => ({
        guildId: "1",
        channelId: "2",
        messageId: String((before ? 150 : 250) - i),
        text,
        createdAt: "2026-09-19T00:00:00Z",
        editedAt: null,
        sourceUrl: "https://discord.com/channels/1/2/3",
      }));
    },
  };
  const deps = {
    store,
    reader,
    policy: {
      apply: async () => ({ content: "" }),
      eligible: async () => true,
    },
    dailyLimit: 0,
  };
  await collectDiscordMessages(deps);
  assert.deepEqual(scan, { cursor: "100", head: "250", before: "151" });
  await collectDiscordMessages(deps);
  assert.deepEqual(scan, { cursor: "250" });
  assert.deepEqual(pages, [undefined, "151"]);
});
test("Discord adapter only GETs designated resources, validates guild, and honors rate limits", async () => {
  const urls: string[] = [];
  const reader = createDiscordReader("test-token", (async (url, init) => {
    assert.equal(init?.method, "GET");
    urls.push(String(url));
    return new Response(
      JSON.stringify(
        String(url).endsWith("/channels/2")
          ? { id: "2", guild_id: "1", type: 0 }
          : {
              id: "3",
              channel_id: "2",
              content: text,
              timestamp: "2026-09-19T00:00:00Z",
              edited_timestamp: null,
              type: 0,
            },
      ),
      { status: 200 },
    );
  }) as typeof fetch);
  assert.equal(
    (await reader.get({ guildId: "1", channelId: "2", messageId: "3" }))?.text,
    text,
  );
  assert.equal(urls.length, 2);
  assert.ok(urls[1].endsWith("/channels/2/messages/3"));
  await assert.rejects(
    reader.get({ guildId: "9", channelId: "2", messageId: "3" }),
  );
  let calls = 0;
  const limited = createDiscordReader("test", (async () => {
    calls++;
    return new Response('{"retry_after":300}', { status: 429 });
  }) as typeof fetch);
  await assert.rejects(limited.list({ guildId: "1", channelId: "2" }));
  await assert.rejects(limited.list({ guildId: "1", channelId: "2" }));
  assert.equal(calls, 1);
});

test("undated announcements default only to their original campus posting day", () => {
  const announcement = "Chess night at 5:30-6:30PM in Squires";
  const value = { ...proposal, date: "2026-09-19", onlineUrl: null, isOnline: false,
    evidence: { ...proposal.evidence, date: "", online: null } };
  const context = { postedAt: "2026-09-20T01:00:00Z", timezone: "America/New_York" };
  const result = validateDiscordCandidate(value, announcement, context);
  assert.equal(result?.date, "2026-09-19");
  assert.match(result!.dateReasoning!, /original posting date/);
  assert.equal(validateDiscordCandidate({ ...value, date: "2026-09-20" }, announcement, context), null);
  assert.equal(validateDiscordCandidate(value, announcement), null);
  assert.equal(validateDiscordCandidate(value, announcement, { ...context, postedAt: "invalid" }), null);
  for (const day of ["tomorrow", "next Friday", "soon", "September 25", "2026-09-25", "February 30, 2026"])
    assert.equal(validateDiscordCandidate(value, `${announcement} ${day}`, context), null);
  const grouped = { ...context, messages: [{ messageId: "1", text: announcement, createdAt: context.postedAt }] };
  assert.equal(validateDiscordCandidate(value, announcement, grouped), null);
  assert.equal(validateDiscordCandidate({ ...value, dateMessageId: "1" }, announcement, grouped)?.date, "2026-09-19");
  assert.equal(validateDiscordCandidate({ ...value, date: "2026-12-31" }, announcement,
    { ...context, postedAt: "2027-01-01T02:00:00Z" })?.date, "2026-12-31");
});

test("relative dates use original posting time in campus timezone, including midnight, DST and year rollover", () => {
  const infer = (phrase: string, date: string, postedAt: string) => {
    const announcement = `Chess night ${phrase} at Squires`;
    const value = {
      ...proposal,
      date,
      onlineUrl: null,
      isOnline: false,
      dateReasoning: "Resolved from the original local posting date.",
      evidence: { ...proposal.evidence, date: phrase, online: null },
    };
    return validateDiscordCandidate(value, announcement, {
      postedAt,
      timezone: "America/New_York",
    });
  };
  assert.ok(infer("today", "2026-09-19", "2026-09-20T01:00:00Z"));
  assert.equal(
    infer("today", "2026-09-20", "2026-09-20T01:00:00Z"),
    null,
    "UTC date must not replace campus date",
  );
  assert.ok(infer("tomorrow", "2027-01-01", "2026-12-31T22:00:00Z"));
  assert.ok(infer("tomorrow", "2026-03-09", "2026-03-08T05:30:00Z"));
  assert.ok(infer("September 25", "2026-09-25", "2026-09-19T21:00:00Z"));
  assert.ok(infer("next Friday", "2026-09-25", "2026-09-19T21:00:00Z"));
  assert.equal(
    infer("next Friday", "2026-09-26", "2026-09-19T21:00:00Z"),
    null,
  );
  assert.equal(infer("today", "2099-09-19", "2026-09-19T21:00:00Z"), null);
  assert.equal(infer("soon", "2026-09-25", "2026-09-19T21:00:00Z"), null);
  assert.equal(
    infer("February 30, 2026", "2026-03-02", "2026-02-01T21:00:00Z"),
    null,
  );
  assert.equal(infer("today", "2026-09-19", "invalid"), null);
  const relative = {
    ...proposal,
    dateReasoning: "today",
    evidence: { ...proposal.evidence, date: "today" },
  };
  assert.equal(
    validateDiscordCandidate(relative, "Chess night today at Squires"),
    null,
    "relative dates require trusted metadata",
  );
});
