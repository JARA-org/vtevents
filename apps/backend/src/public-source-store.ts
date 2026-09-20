import { db } from "./store.js";
import type {
  PublicPageCache,
  PublicSourceRepository,
} from "../../../packages/shared/src/contracts.js";
import { createHash } from "node:crypto";
const memory = new Map<string, Map<string, PublicPageCache>>();
/** Persistent per-page checkpoints; each successful revision is an atomic upsert. Public records only. */
export const publicSourceRepository: PublicSourceRepository = {
  async pages(sourceId) {
    return db
      ? await db
          .collection<PublicPageCache & { sourceId: string }>(
            "public_source_pages",
          )
          .find({ sourceId }, { projection: { _id: 0, sourceId: 0 } })
          .toArray()
      : [...(memory.get(sourceId)?.values() || [])];
  },
  async savePage(sourceId, page) {
    if (db) {
      const key = createHash("sha256")
        .update(sourceId + "\n" + page.url)
        .digest("hex");
      await db
        .collection("public_source_pages")
        .updateOne(
          { _id: key as never },
          { $set: { sourceId, ...page } },
          { upsert: true },
        );
    } else {
      if (!memory.has(sourceId)) memory.set(sourceId, new Map());
      memory.get(sourceId)!.set(page.url, page);
    }
  },
};
