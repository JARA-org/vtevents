import type {
  DiscordBotRepository,
  DiscordCollectionRepository,
  DiscordMessageReader,
  DiscordTextExtractor,
  DiscordCollectedMessage,
  DiscordReadTarget,
  DiscordExtractionLimits,
} from "../../../packages/shared/src/contracts.js";
import { eligibleDiscordMessage } from "./discord-bot.js";
import { validateDiscordCandidate } from "./discord-event-rules.js";
import { createHash } from "node:crypto";
import { DiscordReadError } from "./discord-reader.js";

/** Bounded read-only poll. Stages evidence-backed proposals; never publishes canonical events or writes user calendars. */
export async function collectDiscordMessages(deps: {
  policy: DiscordBotRepository;
  store: DiscordCollectionRepository;
  reader: DiscordMessageReader;
  extractor?: DiscordTextExtractor;
  dailyLimit: number;
  limits?: DiscordExtractionLimits;
  /** Event-driven mode: read only these exact message IDs; never scan channel history. */
  targets?: DiscordReadTarget[];
  settleMs?: number;
}) {
  const { policy, store, reader, extractor } = deps;
  const summary = {
    read: 0,
    qualified: 0,
    rejected: 0,
    pending: 0,
    removed: 0,
    errors: 0,
    skipped: false,
  };
  if (!(await store.acquire())) return { ...summary, skipped: true };
  const deadline = Date.now() + 120000;
  async function processMessage(message: DiscordCollectedMessage) {
    summary.read++;
    if (
      !message.text.trim() ||
      !(await eligibleDiscordMessage(policy, {
        ...message,
        text: message.text,
      }))
    ) {
      await store.remove(message);
      summary.removed++;
      return;
    }
    const fingerprint = createHash("sha256")
      .update(
        "discord-extraction-v2\nAmerica/New_York\n" +
          message.createdAt +
          "\n" +
          message.text,
      )
      .digest("hex");
    if (await store.unchanged(message, fingerprint)) {
      await store.checked(message);
      return;
    }
    // Save the new revision as pending before any inference, invalidating an older proposal immediately.
    await store.save(message, fingerprint, null, "pending");
    const changedAt = Date.parse(message.editedAt || message.createdAt);
    // Wait for edits to settle and bound input size. Spending is capped per server.
    if (
      !extractor ||
      !Number.isFinite(changedAt) ||
      Date.now() - changedAt < (deps.settleMs ?? 90000) ||
      message.text.length > 6000
    ) {
      summary.pending++;
      return;
    }
    // Recheck current opt-out immediately before any external model request.
    if (!(await eligibleDiscordMessage(policy, message))) {
      await store.remove(message);
      return;
    }
    if (
      !(await store.reserveExtraction({
        ...message,
        fingerprint,
        limits: deps.limits || {
          serverOnly: true,
          globalDaily: deps.dailyLimit,
          guildDaily: 5,
          guildHourly: 2,
          messageDaily: 2,
        },
      }))
    ) {
      summary.pending++;
      return;
    }
    try {
      const context = {
        postedAt: message.createdAt,
        timezone: "America/New_York",
      };
      const proposed = await extractor.propose(message.text, context);
      const candidate = validateDiscordCandidate(
        proposed,
        message.text,
        context,
      );
      await store.save(
        message,
        fingerprint,
        candidate,
        candidate ? "qualified" : "rejected",
      );
      summary[candidate ? "qualified" : "rejected"]++;
    } catch {
      summary.pending++;
    } // Uncertain model work is not retried within this poll.
  }
  async function readOne(target: DiscordReadTarget) {
    if (!(await policy.eligible({ ...target, messageId: target.messageId! }))) {
      await store.remove(target);
      return;
    }
    try {
      const message = await reader.get(target);
      if (message) await processMessage(message);
      else {
        await store.remove(target);
        summary.removed++;
      }
    } catch (e) {
      if (e instanceof DiscordReadError && [403, 404].includes(e.status))
        await store.remove(target);
      else throw e;
    } finally {
      await store.checked(target);
    }
  }
  try {
    for (const target of deps.targets ?? (await store.messages(20))) {
      if (Date.now() > deadline) break;
      try {
        await readOne(target);
      } catch (e) {
        summary.errors++;
        if (e instanceof DiscordReadError && [401, 429].includes(e.status))
          return summary;
      }
    }
    for (const target of deps.targets ? [] : await store.channels(10)) {
      if (Date.now() > deadline) break;
      try {
        const batch = await reader.list(target, target.scan.before);
        const head =
          target.scan.head || batch[0]?.messageId || target.scan.cursor;
        const fresh = batch.filter(
          (m) =>
            !target.scan.cursor ||
            BigInt(m.messageId) > BigInt(target.scan.cursor),
        );
        let complete = true;
        for (const message of fresh) {
          if (Date.now() > deadline) {
            complete = false;
            break;
          }
          await processMessage(message);
        }
        if (!complete) continue; // Repeat page, with fingerprints preventing repeated inference.
        const caughtUp = batch.length < 100 || fresh.length < batch.length;
        await store.checkpoint(
          target,
          caughtUp
            ? { cursor: head }
            : {
                cursor: target.scan.cursor,
                head,
                before: batch.at(-1)!.messageId,
              },
        );
      } catch (e) {
        summary.errors++;
        if (e instanceof DiscordReadError && [401, 429].includes(e.status))
          return summary;
        await store.checkpoint(target, target.scan);
      }
    }
  } finally {
    await store.release();
  }
  return summary;
}
