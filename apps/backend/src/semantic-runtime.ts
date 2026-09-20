import { createSemanticSearch } from "./semantic-search.js";
import { semanticEmbedding } from "./semantic-embedding.js";
import { semanticRepository } from "./semantic-store.js";
/** Backend composition only. No side effects until an explicit service command. */
export const semanticSearch = createSemanticSearch(semanticEmbedding, semanticRepository);
export const forgetSemanticUser = semanticRepository.forgetUser;
