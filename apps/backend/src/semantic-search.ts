import { createHash } from "node:crypto";
import type { CampusEvent, SemanticEmbeddingProvider, SemanticIndexRepository, SemanticSearchService } from "../../../packages/shared/src/contracts.js";
const version = "gemini-embedding-001:768:retrieval:v1:";
const valid = (v: number[]) => Array.isArray(v) && v.length === 768 && v.every(Number.isFinite) && Number.isFinite(Math.hypot(...v)) && Math.hypot(...v) > 1e-12;
const publicEvents = (events: CampusEvent[]) => events.filter(e =>
  (!e.visibility || e.visibility.kind === "public") && e.status !== "cancelled");
const persisted = (e: CampusEvent) => !e.sources.some(s => s.source === "discord");
/** Bounded evidence projection; excludes user context, links and credentials. Hash
 * changes with meaningful evidence, never refresh timestamps. Pure and stable. */
function document(e: CampusEvent) {
  const text = [e.title, e.description, e.sports?.sport, e.organizer, e.location, e.categories.join(", ")]
    .filter(Boolean).join("\n").slice(0, 1400);
  return { key: version + createHash("sha256").update(text).digest("hex"), text };
}
/** Service factory. All storage/provider effects flow through declared ports. Public
 * indexing is lease-serialized and bounded to 64 changed documents per invocation.
 * Search intersects current caller-authorized catalog, never trusts stored IDs.
 * Discord vectors are request-local only (revocable content is never archived).
 * No query cache or transcript retention. Errors return explicit unavailable state. */
export function createSemanticSearch(provider: SemanticEmbeddingProvider, repo: SemanticIndexRepository): SemanticSearchService {
  return {
    async index(events) {
      if (!provider.ready || !await repo.acquire()) return;
      try {
        const docs = [...new Map(publicEvents(events).filter(persisted).map(e => { const d = document(e); return [d.key, d]; })).values()];
        await repo.prune(docs.map(d => d.key));
        const known = new Set((await repo.read(docs.map(d => d.key))).filter(r => valid(r.vector)).map(r => r.key));
        const missing = docs.filter(d => !known.has(d.key)).slice(0, 64);
        for (let offset = 0; offset < missing.length; offset += 16) {
          const batch = missing.slice(offset, offset + 16);
          if (!await repo.reserve(batch.length)) break;
          const vectors = await provider.embed(batch.map(d => d.text), "document");
          if (vectors.length !== batch.length || vectors.some(v => !valid(v))) throw new Error("Invalid vector batch");
          await repo.put(batch.map((d, i) => ({ key: d.key, vector: vectors[i] })));
        }
      } catch { console.warn("semantic_index_unavailable"); }
      finally { await repo.release(); }
    },
    async search(query, events, userId) {
      const catalog = publicEvents(events);
      const result = { ids: [] as string[], status: "unavailable" as "ready" | "partial" | "unavailable", indexed: 0, total: catalog.length };
      if (!provider.ready || !userId || !query.trim() || query.length > 1000) return result;
      try {
        const docs = catalog.map(e => ({ event: e, ...document(e) }));
        const vectors = new Map((await repo.read(docs.filter(d => persisted(d.event)).map(d => d.key)))
          .filter(r => valid(r.vector)).map(r => [r.key, r.vector]));
        // Revocable Discord content is embedded only for this explicit request.
        const ephemeral = [...new Map(docs.filter(d => !persisted(d.event)).map(d => [d.key, d])).values()];
        const deadline = Date.now() + 15000;
        for (let offset = 0; offset < ephemeral.length && Date.now() < deadline; offset += 16) {
          const batch = ephemeral.slice(offset, offset + 16);
          if (!await repo.reserve(batch.length, userId)) break;
          const values = await provider.embed(batch.map(d => d.text), "document");
          if (values.length !== batch.length || values.some(v => !valid(v))) throw new Error("Invalid ephemeral vectors");
          batch.forEach((d, i) => vectors.set(d.key, values[i]));
        }
        result.indexed = docs.filter(d => vectors.has(d.key)).length;
        if (!result.indexed) return { ...result, status: catalog.length ? "partial" : "ready" };
        if (!await repo.reserve(1, userId)) return result;
        const [q] = await provider.embed([query.trim()], "query");
        if (!valid(q)) return result;
        const norm = Math.hypot(...q);
        const scores = docs.flatMap(d => {
          const v = vectors.get(d.key);
          if (!v) return [];
          const score = v.reduce((sum, x, i) => sum + x * q[i], 0) / (Math.hypot(...v) * norm);
          return score >= 0.25 ? [{ id: d.event.id, score, start: d.event.start }] : [];
        }).sort((a, b) => b.score - a.score || a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
        return { ...result, status: result.indexed === catalog.length ? "ready" : "partial", ids: scores.map(s => s.id) };
      } catch { console.warn("semantic_search_unavailable"); return result; }
    },
  };
}
