/** Read-only smoke: one bounded source pass, isolated in-memory checkpoints, no database or AI calls. */
import { publicSources } from "../apps/backend/src/public-source-registry.js";
import { collectPublicSource } from "../apps/backend/src/public-ingestion.js";
import { createPublicFetcher } from "../apps/backend/src/public-fetch.js";
import type { PublicPageCache } from "../packages/shared/src/contracts.js";
const selected=process.argv.slice(2);
for (const source of publicSources.filter(s=>!selected.length||selected.includes(s.id))) {
  const pages = new Map<string, PublicPageCache>();
  const result = await collectPublicSource(
    { ...source, maxPages: Math.min(24,Math.max(1,Number(process.env.PUBLIC_SOURCE_SMOKE_PAGES)||3)) },
    {
      pages: async () => [...pages.values()],
      savePage: async (_, p) => {
        pages.set(p.url, p);
      },
    },
    createPublicFetcher(),
  );
  console.log(
    JSON.stringify({
      source: source.id,
      events: result.events.length,
      deadlines: result.deadlines.length,
      checked: result.pagesChecked,
      errors: result.errors,
      more: result.hasMore,
    }),
  );
}
