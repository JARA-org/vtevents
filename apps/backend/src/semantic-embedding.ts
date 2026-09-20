import { GoogleGenAI } from "@google/genai";
import type { SemanticEmbeddingProvider } from "../../../packages/shared/src/contracts.js";

/** Fixed free-tier text model. Bounded explicit calls only, no tools, URL fetching,
 * retries or storage. Text is data, never executable instructions. Invalid/missing
 * vectors fail closed. The operator must keep project billing disabled. */
export const semanticEmbedding: SemanticEmbeddingProvider = {
  get ready() {
    return process.env.SEMANTIC_SEARCH_ENABLED !== "false" &&
      process.env.GEMINI_FREE_TIER_CONFIRMED === "true" && !!process.env.GEMINI_API_KEY;
  },
  async embed(texts, task) {
    if (!this.ready || !texts.length || texts.length > 16 || texts.some(t => !t || Buffer.byteLength(t) > 6000))
      throw new Error("Embedding input unavailable");
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await client.models.embedContent({
      model: "gemini-embedding-001", contents: texts,
      config: { taskType: task === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
        outputDimensionality: 768, httpOptions: { timeout: 12000, retryOptions: { attempts: 1 } } },
    });
    if (result.embeddings?.length !== texts.length) throw new Error("Invalid embeddings");
    return result.embeddings.map(e => {
      const v = e.values;
      if (!v || v.length !== 768 || v.some(n => !Number.isFinite(n))) throw new Error("Invalid embedding vector");
      const norm = Math.hypot(...v);
      if (!Number.isFinite(norm) || norm < 1e-12) throw new Error("Empty embedding vector");
      return v.map(n => n / norm);
    });
  },
};
