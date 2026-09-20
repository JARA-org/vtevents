import { randomUUID } from "node:crypto";
import { database } from "./store.js";
import { config } from "./config.js";
import { seal, unseal, hash } from "./security.js";

type EmailRecord = {
  _id: string;
  userId?: string;
  encrypted: string;
  expiresAt: Date;
  nextAttempt: Date;
  attempts: number;
  lease?: string;
};

/** Configuration query only; no credentials returned, I/O, authorization or retries. */
export function accountEmailReady() {
  return !!(
    process.env.RESEND_API_KEY &&
    process.env.AUTH_EMAIL_FROM &&
    process.env.TOKEN_ENCRYPTION_KEY
  );
}

/** Better Auth invokes this for its validated user/token. Encrypt recipient/link
 * in a durable expiring queue; no provider calls. Stable link hash deduplicates
 * retries. Reject foreign links. One atomic upsert, errors propagate to auth. */
export async function queueAccountEmail(
  to: string,
  url: string,
  kind: "reset" | "verify",
  userId?: string,
) {
  if (!accountEmailReady()) throw new Error("Account email unavailable");
  if (new URL(url).origin !== config.origin)
    throw new Error("Invalid account email link");
  const id = hash(kind + url);
  await database()
    .collection<EmailRecord>("account_email_outbox")
    .updateOne(
      { _id: id },
      {
        $setOnInsert: {
          userId,
          encrypted: seal({ to, url, kind }),
          expiresAt: new Date(Date.now() + 3600000),
          nextAttempt: new Date(),
          attempts: 0,
        },
      },
      { upsert: true },
    );
}

/** Internal worker only. Claims at most 10 queued messages; lease prevents parallel
 * delivery and provider idempotency handles ambiguous responses. No user content
 * logged. Failed deliveries retry at most five times before expiry; database
 * effects are atomic per record, never a transaction spanning the network. */
export async function flushAccountEmail() {
  if (!accountEmailReady()) return;
  const rows = database().collection<EmailRecord>("account_email_outbox");
  await rows.deleteMany({ expiresAt: { $lte: new Date() } });
  for (let i = 0; i < 10; i++) {
    const lease = randomUUID();
    const row = await rows.findOneAndUpdate(
      {
        nextAttempt: { $lte: new Date() },
        expiresAt: { $gt: new Date() },
        attempts: { $lt: 5 },
      },
      {
        $set: { lease, nextAttempt: new Date(Date.now() + 120000) },
        $inc: { attempts: 1 },
      },
      { returnDocument: "after" },
    );
    if (!row) break;
    try {
      const { to, url, kind } = unseal<{
        to: string;
        url: string;
        kind: string;
      }>(row.encrypted);
      const subject =
        kind === "reset"
          ? "Reset your My Gobbler password"
          : "Verify your My Gobbler email";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": String(row._id),
        },
        body: JSON.stringify({
          from: process.env.AUTH_EMAIL_FROM,
          to: [to],
          subject,
          text: `${subject}\n\n${url}\n\nThis link expires in one hour. If you did not request this, ignore this email.\n\nMy Gobbler — student-built, not affiliated with Virginia Tech.`,
        }),
      });
      if (!response.ok) throw new Error("Email provider unavailable");
      await rows.deleteOne({ _id: row._id, lease });
    } catch {
      await rows.updateOne(
        { _id: row._id, lease },
        {
          $set: {
            nextAttempt: new Date(
              Date.now() + Math.min(900000, 60000 * 2 ** row.attempts),
            ),
          },
        },
      );
      console.warn("account_email_delivery_retry");
    }
  }
}
