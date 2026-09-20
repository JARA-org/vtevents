# Semantic event search

Discover supports **By meaning** and **Exact keywords**. Search is explicitly
submitted rather than sent on each keystroke. Keyword search retains the existing
read-only behavior. Meaning search requires the authenticated user's personalized
AI setting and consent version 1; otherwise it labels its results as keyword
matches and sends no query to Gemini. Search drafts clear when the account changes.

`POST /api/discovery` accepts optional `searchMode: "semantic"`; absence remains
keyword search. The existing category/date filters are enforced by the discovery
module before semantic retrieval. The reply adds optional `search` metadata:
`ready`, `partial`, `unavailable`, or `consent_required`, with index coverage and a
human-readable notice. Provider/index failure does not silently masquerade as
semantic results. Current visibility and filters are checked again after model
latency. Saved events remain a separate, untruncated user-owned projection.

Ask Gobbler also uses semantic retrieval before composing its bounded candidate
set. This retrieves events by meaning across the eligible catalog instead of
depending entirely on keyword preselection. Model intent still controls whether
event cards are appropriate; greetings, help and preference statements do not
request event cards. If semantic retrieval is unavailable, chat can use its
existing candidate selection without claiming semantic-search success.

## Implementation and privacy

The backend uses the fixed `gemini-embedding-001` model, 768-dimensional normalized
vectors, `RETRIEVAL_DOCUMENT` for public event text and `RETRIEVAL_QUERY` for queries.
Cosine similarity ranks current event IDs. No vector database service or paid
infrastructure is required: cached vectors live in the existing MongoDB database.
Embeddings interpret meaning; permissions, date arithmetic, filters, matching
thresholds and event rendering remain deterministic backend code.

The embedding adapter has no tools, follows no embedded instructions or links,
and validates vector dimensions, finite components, cardinality and nonzero norm.
It permits at most 16 inputs per call, bounds each projected document, sets a
12-second timeout and disables SDK retries. The backend-only free-tier attestation
and API key must both be present. `SEMANTIC_SEARCH_ENABLED=false` disables indexing
and retrieval. The operator must retain a free-tier project with billing disabled;
application counters cannot prove billing status.

Public website vectors are cached by model/projection version and the content
hash of title, description, sport, organizer, location and categories. Refresh
timestamps do not cause re-embedding. Removed content is pruned; edited content
cannot reuse stale vectors. Search always intersects the fresh authorized catalog,
so an old cached vector cannot resurrect a withdrawn record. Historical events
are not indexed by the production current-event job.

Revocable Discord text is never persisted in the vector index. Eligible Discord
events are embedded only within an explicit request and discarded afterward.
Private/channel/user-scoped events are excluded before any embedding call.
Queries are never written to storage or logs. No profile, attendance, saved IDs,
chat history or account identity is included in embedding requests. A typed query
can still contain personal information, so the search UI discloses transmission.

## Indexing, limits and failures

The existing background worker indexes up to 64 changed website documents per
pass in batches of 16. A MongoDB lease prevents overlapping index workers.
The index warms incrementally after deployment; responses explicitly report
partial coverage until the currently eligible catalog is indexed. Exact keyword
search remains available during warm-up and provider outages.

Embedding usage is distinct from Discord extraction and chat generation quotas:
2,500 input texts per UTC day, 160 per minute, and 50 reservations per user per
day for explicit query-time work. Atomic transactions enforce limits across
workers; failed provider calls still count. Query-time Discord batches stop after
a bounded processing window or budget exhaustion and report partial coverage.
The demo server's Discord extraction override does not disable these limits.
Budget records expire after two days, and account deletion removes that user's
budget counters. No query is retained in them.

Tests exercise semantic relevance without literal overlap, cache hits, changed
content, withdrawn/private records, request-local Discord vectors, malformed
provider output, unavailable states, consent, scope and concurrent reservations.
Production model availability must be tested separately from mocked regression
tests; no learned-quality metric is claimed by those tests.

Provider reference: [Gemini embeddings documentation](https://ai.google.dev/gemini-api/docs/embeddings).
