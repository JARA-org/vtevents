# Production performance investigation — September 20, 2026

## Measured problem

- Public health request took 21.76 s while the page shell took 0.26 s.
- A disposable authenticated production account measured `/api/events` at
  6.755 s / 2,030,147 bytes and discovery at 11.372 s / 4,749,360 bytes
  (uncompressed response bytes). The account was deleted after the test.
- Reconciliation ran three all-pairs scans: native revisions, compatible
  groups, and previous canonical IDs. It ran during ingestion AND ordinary
  event/discovery/detail/calendar requests, blocking the Node event loop.
- A 2,600-record synthetic catalog took 6,137 ms locally before indexing;
  the same benchmark took 94 ms after indexing. This is a CPU benchmark, not
  a claim that every website action is 65 times faster.

## Changes

- Per-invocation candidate indexes narrow comparisons by scope, source identity,
  occurrence URL/date, and exact occurrence fields. Original compatibility
  predicates, first-match order, complete-link grouping, ID reuse, owner
  corrections and conflict evidence remain authoritative. No private/global
  cross-request cache is introduced; Discord eligibility is still read freshly.
- Already consolidated website events bypass request-time reconsolidation when
  no Discord events are present.
- Discovery accepts optional `limit` (1–100); absent retains legacy full
  responses. Counts describe the full catalog/search. Saved/schedule projections
  remain complete. The website requests 60 items and no longer downloads the
  whole catalog separately. Search/filtering stays on the backend. Loading
  state prevents a false empty message while a request is pending.
- Idle scheduler ticks do not reload full Mongo snapshots. Public memory uses
  one indexed head read and up to three ordered bulk writes per 100-record
  coordinator batch, within the existing atomic transaction. Unchanged records
  still produce no writes, and historical/private scope rules remain intact.
- Real catalog profiling also found multi-year source windows. Schedule checks
  return unknown for windows longer than 31 days (after exact dated busy-block
  checks) rather than expanding thousands of days. The explanation asks users
  to confirm individual meeting times. No-recurring-block checks skip daily
  expansion entirely. Normal campus timezone/DST conflict tests remain intact.
- Once per minute, `runtime_performance` logs numeric RSS, heap, CPU percentage
  and event-loop p99/max delays. No event text, URLs, user data or secrets.
  Deployment reports host capacity before and after its five-minute stability
  window; diagnostic-tool failure cannot fail a healthy deployment.

## Validation and operation

Regression coverage includes 2,600 identities, revision-index replacement,
complete-link club separation, result limits, full-catalog search, complete
saved schedules, legacy response behavior and idle snapshot-read avoidance.
An additional local comparison of 100 seeded mixed-identity catalogs produced
exactly the same results as the prior reconciliation implementation.

Run `npm run typecheck`, `npm test`, `npm run build` and the deployed HTTPS
smoke checks. Check GitHub Actions deployment logs for host/process metrics.
Live post-deployment timings are recorded in the release handoff after rollout.

Do not provision another VPS to mask an all-pairs CPU algorithm. Retain the
single modular backend pending measurements of the optimized application. If
ingestion still causes sustained CPU/memory pressure, isolate a bounded worker
process with explicit snapshot invalidation before considering another paid
instance. Extra resources remain subject to the owner's hard spending cap.

References: [Node event-loop guidance](https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop)
and [Atlas free-cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).
