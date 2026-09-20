import { db } from "./store.js";
import { syncCalendar } from "./integrations.js";
import { refreshSources } from "./coordinator.js";
let pending: Promise<void> | undefined;
export function runJobs() {
  if (pending) return pending;
  pending = (async () => {
    await refreshSources();
    if (db) {
      const connections = await db
        .collection("connections")
        .find({
          status: "connected",
          provider: { $in: ["google", "canvas"] },
          $or: [
            { lastSync: null },
            { lastSync: { $lt: new Date(Date.now() - 3600000) } },
          ],
        })
        .sort({ lastSync: 1 })
        .limit(25)
        .toArray();
      for (const row of connections) {
        try {
          if (row.provider === "google" || row.provider === "canvas")
            await syncCalendar(row.userId, row.provider);
        } catch {
          await db
            .collection("connections")
            .updateOne(
              { _id: row._id },
              { $set: { status: "error", lastAttempt: new Date() } },
            );
        }
      }
    }
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
