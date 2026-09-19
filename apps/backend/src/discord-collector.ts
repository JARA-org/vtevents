import type {
  DiscordBotRepository,
  DiscordCollectionRepository,
  DiscordMessageReader,
  DiscordTextExtractor,
  DiscordCollectedMessage,
  DiscordReadTarget,
  DiscordExtractionLimits,
  DiscordExtractionContext,
} from "../../../packages/shared/src/contracts.js";
import { eligibleDiscordMessage } from "./discord-bot.js";
import { validateDiscordCandidate } from "./discord-event-rules.js";
import { createHash } from "node:crypto";
import { DiscordReadError } from "./discord-reader.js";
import { z } from "zod";

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
  // Exact-message workers serialize only that message; legacy scans retain their global lock.
  const lockTarget = deps.targets?.length === 1 ? deps.targets[0] : undefined;
  if (!(await store.acquire(lockTarget))) return { ...summary, skipped: true };
  const deadline = Date.now() + 120000;
  async function processMessage(message: DiscordCollectedMessage) {
    summary.read++;
    if (
      (!message.text.trim() && !message.images?.length) ||
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
        "discord-extraction-v3\nAmerica/New_York\n" +
          message.createdAt +
          "\n" +
          message.text +
          JSON.stringify({
            parts: message.parts,
            images: message.images?.map(
              ({ id, messageId, size, mimeType }) => ({
                id,
                messageId,
                size,
                mimeType,
              }),
            ),
          }),
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
      message.text.length > 6000 ||
      (message.images?.length || 0) > 3
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
          guildDaily: 20,
          guildHourly: 5,
          messageDaily: 2,
        },
      }))
    ) {
      summary.pending++;
      return;
    }
    try {
      const images = message.images?.length
        ? await reader.images?.(message.images)
        : [];
      if (message.images?.length && !images)
        throw new Error("Image reader unavailable");
      const context: DiscordExtractionContext = {
        postedAt: message.createdAt,
        timezone: "America/New_York",
        ...(message.parts ? { messages: message.parts } : {}),
      };
      let proposed = await extractor.propose(message.text, context, images);
      if (images?.length) {
        const result = z
          .object({
            candidate: z.unknown(),
            imageTexts: z
              .array(
                z
                  .object({
                    attachmentId: z.string(),
                    messageId: z.string(),
                    text: z.string().max(4000),
                  })
                  .strict(),
              )
              .max(3),
          })
          .strict()
          .parse(proposed);
        if (
          result.imageTexts.reduce((n, t) => n + t.text.length, 0) > 4000 ||
          result.imageTexts.some(
            (t) =>
              !images.some(
                (i) =>
                  i.attachmentId === t.attachmentId &&
                  i.messageId === t.messageId,
              ),
          )
        )
          throw new Error("Invalid image evidence");
        message = { ...message, imageTexts: result.imageTexts };
        proposed = result.candidate;
        context.messages = message.parts?.map((p) => ({
          ...p,
          text:
            p.text +
            result.imageTexts
              .filter((t) => t.messageId === p.messageId)
              .map((t) => "\n" + t.text)
              .join(""),
        }));
      }
      const candidate = validateDiscordCandidate(
        proposed,
        message.text +
          (message.imageTexts || []).map((t) => "\n" + t.text).join(""),
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
    await store.release(lockTarget);
  }
  return summary;
}
