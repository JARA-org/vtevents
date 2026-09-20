import { db, database } from "./store.js";
import { discordBotRepository } from "./discord-bot-store.js";
import { discordCollectionRepository } from "./discord-collection-store.js";
import { createDiscordReader } from "./discord-reader.js";
import { createDiscordExtractor } from "./discord-extractor.js";
import { collectDiscordMessages } from "./discord-collector.js";
import { discordExtractionLimits } from "./discord-limits.js";
import { discordTriggerQueue } from "./discord-trigger-store.js";
import { startDiscordGateway } from "./discord-gateway.js";
import { discordAnnouncements } from "./discord-announcements.js";
import { createAnnouncementReader } from "./discord-announcement-reader.js";
import type {
  DiscordMessageTrigger,
  DiscordCollectionInspection,
  DiscordExtractionLimits,
  DiscordTriggerQueue,
  DiscordMessageJob,
} from "../../../packages/shared/src/contracts.js";
let pending: Promise<void> | undefined;
let reader: ReturnType<typeof createDiscordReader> | undefined;
let stopRuntime: (() => Promise<void>) | undefined;
let state: NonNullable<DiscordCollectionInspection["listenerStatus"]> =
  "disabled";
/** Internal scheduler: three lanes claim durable leases for at most 30 seconds.
 * Calls process only for claimed jobs; that callback owns completion/retry effects.
 * No authorization/provider/AI work here. Queue failures propagate after all lanes settle;
 * unfinished leases expire for retry. No transaction spans jobs or model requests.
 */
export async function runDiscordWorkers(
  queue: Pick<DiscordTriggerQueue, "claim">,
  process: (job: DiscordMessageJob) => Promise<void>,
): Promise<void> {
  const deadline = Date.now() + 30000;
  const results = await Promise.allSettled(
    Array.from({ length: 3 }, async () => {
      while (Date.now() < deadline) {
        const job = await queue.claim();
        if (!job) return;
        await process(job);
      }
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
/** Scheduling only. Early attempts retry quickly so a settling edit, a brief provider
 * error or a busy lock costs seconds instead of a flat minute; later attempts back off
 * to the previous one-minute ceiling. Retrying sooner cannot increase spending: the
 * atomic per-server budgets and the single per-revision reservation are unchanged, and
 * a denied reservation increments nothing. */
export function retryDelay(job: Pick<DiscordMessageJob, "attempts">) {
  const attempts = Math.max(1, job.attempts ?? 1);
  return Math.min(60000, 3000 * 2 ** (attempts - 1));
}
/** Work stays queued while it may still proceed. When this exact revision has already
 * consumed its one extraction reservation, no later poll can change the outcome, so the
 * job is dropped instead of waking every minute forever. The staged record keeps its
 * pending status for `/gobbler status`, and an edit or explicit submission enqueues a
 * new revision. Returning a delay (never undefined) keeps the job when unsure. */
async function deferral(job: DiscordMessageJob, limits: DiscordExtractionLimits) {
  try {
    const fingerprint = await currentFingerprint(job);
    if (!fingerprint) return retryDelay(job);
    const spent = await discordCollectionRepository.extractionSpent?.({
      guildId: job.guildId,
      channelId: job.channelId,
      messageId: job.messageId,
      fingerprint,
      limits,
    });
    if (spent) {
      console.warn("discord_extraction_exhausted", JSON.stringify({
        guildId: job.guildId,
        channelId: job.channelId,
        messageId: job.messageId,
      }));
      return undefined;
    }
  } catch {
    /* Unknown state keeps the job queued. */
  }
  return retryDelay(job);
}
/** Reads the fingerprint the collector just stored for this message. No provider or
 * model call: it only reports what the last collection pass recorded. */
async function currentFingerprint(job: DiscordMessageJob) {
  const row = await database()
    .collection<{ key: string; fingerprint?: string }>(
      "discord_collected_messages",
    )
    .findOne({ key: `${job.guildId}:${job.channelId}:${job.messageId}` });
  return row?.fingerprint || "";
}
/** Drain only event-triggered persistent work; never scan Discord channels or call AI for an unrelated message. */
export function runDiscordCollection(): Promise<void> {
  if (pending) return pending;
  if (
    !db ||
    process.env.DISCORD_COLLECTION_ENABLED !== "true" ||
    !process.env.DISCORD_BOT_TOKEN
  )
    return Promise.resolve();
  reader ||= createAnnouncementReader(
    createDiscordReader(process.env.DISCORD_BOT_TOKEN),
    discordAnnouncements,
    discordBotRepository,
  );
  pending = runDiscordWorkers(discordTriggerQueue, async (job) => {
    try {
      const limits = discordExtractionLimits();
      const extractor =
        process.env.DISCORD_AI_ENABLED === "true" && process.env.GEMINI_API_KEY
          ? createDiscordExtractor(
              process.env.GEMINI_API_KEY,
              process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
            )
          : undefined;
      const summary = await collectDiscordMessages({
        policy: discordBotRepository,
        store: discordCollectionRepository,
        reader: reader!,
        extractor,
        dailyLimit: limits.globalDaily,
        limits,
        targets: [job],
        settleMs: 0,
      });
      await discordTriggerQueue.finish(
        job,
        summary.skipped
          ? 2000
          : summary.pending || summary.errors
            ? await deferral(job, limits)
            : undefined,
      );
    } catch {
      await discordTriggerQueue.finish(job, retryDelay(job));
      console.warn("discord_job_failed", JSON.stringify({ attempts: job.attempts ?? 1 }));
    }
  }).finally(() => {
    pending = undefined;
  });
  return pending;
}
/** Trusted normalized Gateway IDs; selection is checked before storing work or reading provider text. */
export async function notifyDiscordMessage(event: DiscordMessageTrigger) {
  const root = await discordAnnouncements.invalidate(event);
  if (!(await discordBotRepository.eligible(event))) return;
  if (event.kind === "delete") await discordTriggerQueue.withdraw(event);
  else await discordTriggerQueue.enqueue(root, 3000);
}
/** Start the Gateway and durable-queue pump. The timer reads local queued work, never scans channel history. */
export function startDiscordCollection() {
  if (stopRuntime) return stopRuntime;
  if (
    !db ||
    process.env.DISCORD_COLLECTION_ENABLED !== "true" ||
    !process.env.DISCORD_BOT_TOKEN
  )
    return async () => {};
  const heartbeat = () =>
    database()
      .collection("discord_listener_state")
      .updateOne(
        { key: "gateway" },
        { $set: { status: state, checkedAt: new Date() } },
        { upsert: true },
      )
      .catch(() => console.warn("discord_listener_status_failed"));
  const gateway = startDiscordGateway(
    process.env.DISCORD_BOT_TOKEN,
    notifyDiscordMessage,
    (value) => {
      state = value;
      void heartbeat();
    },
  );
  const pump = setInterval(
    () =>
      void runDiscordCollection().catch(() =>
        console.warn("discord_queue_failed"),
      ),
    1000,
  );
  pump.unref();
  const health = setInterval(() => void heartbeat(), 30000);
  health.unref();
  stopRuntime = async () => {
    clearInterval(pump);
    clearInterval(health);
    await gateway.stop();
    await pending;
    await heartbeat();
    stopRuntime = undefined;
  };
  return stopRuntime;
}
