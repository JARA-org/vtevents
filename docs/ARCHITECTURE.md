# Architecture

```text
Expo Router / React Native web
        | same-origin HTTPS + HttpOnly session cookie
Node.js / Express / TypeScript
        + Better Auth ----- MongoDB Atlas M0 (live tested)
        + source modules -- GobblerConnect official ICS / VT Sports JSON-LD
        + coordinator ----- normalize / validate / deduplicate / cache
        + schedule engine - America/New_York recurring intervals + private busy blocks
        + Gobbler --------- Gemini structured filters + candidate ranking / deterministic fallback
        + integrations ---- Google OAuth+PKCE / Canvas OAuth / Discord OAuth+bot
        + jobs ------------ refresh public/private data + retry analytics
        + outbox ---------- Databricks Statement Execution API
```

`apps/frontend` contains Expo UI; `apps/backend/src` contains the modular Node backend; `packages/shared/src` contains Zod schemas, scheduling logic, ICS generation, and explicitly separate demo fixtures.

Collections: public `events` and `source_snapshots`; private `profiles`, `saved`, `feedback`, `connections`, `private_context`, `calendar_writes`, `oauth_states`; operational `outbox`, `analytics_deletions`, `ai_budget`, `voice_budget`, `voice_cache`, `voice_locks`; Better Auth's `user`, `session`, `account`, `verification`. Unique indexes enforce user/event write identity and one AI budget counter per UTC day. OAuth state expires through both query checks and a Mongo TTL index.

Source snapshots remain separate until deduplication. A MongoDB transaction replaces a successful source snapshot, upserts the canonical event projection, and removes absent records. Failed/partial refreshes preserve the previous snapshot. Provenance aliases preserve canonical event IDs across source updates or disappearing duplicates. Stored snapshots are capped below MongoDB's document-size limit.

Event times are UTC ISO timestamps with original source timezone. Public source metadata includes IDs, URLs and fetch timestamps. Sports metadata sometimes encodes unannounced times as placeholders: `timeTBD` prevents those being treated as confirmed times. Missing end times are not invented. Availability is only free when explicit free intervals cover the event and no known busy interval overlaps. Busy periods override free periods; adjacent endpoints do not overlap.

Google writes use deterministic SHA-256 IDs accepted by Google Calendar, plus a unique database write record. Repeated requests return the completed record. Canvas lacks documented remote idempotency keys: an ambiguous failure retains its pending lock; an operator must reconcile it against the external calendar before unlocking. This prevents blind duplicate retries at the expense of manual recovery.

Untrusted descriptions are plain text. Gemini receives at most 40 public candidate summaries, the question and opted-in interest categories. It produces constrained filter/ranking JSON, validated with Zod and against supplied IDs, and has no tools. Normal application code filters real records, computes conflicts, constructs evidence-based explanations, accesses databases, and writes calendars. Invalid output, exhausted budgets and API/database errors fall back to deterministic matching. SDK retries are disabled to keep the request budget enforceable.

Free hosting cannot guarantee uninterrupted jobs. In-process refresh runs when awake; the optional six-hour Actions trigger wakes the Node service after billing constraints are verified. Background failures are caught and redacted. Outbox records survive process restarts in MongoDB. Databricks insertion uses MERGE by operation ID, making retries idempotent. Account deletion records pseudonymous suppression markers, drops queued interactions, and retries remote DELETE statements. Workers check suppression before and after writes; retained markers also reapply erasure after crashes. Remote deletion is eventual during provider outages.

Optional ElevenLabs narration accepts only current stored public event IDs. Code renders titles, campus-local times and locations; private schedules, user questions and arbitrary client text are excluded. The backend reserves a bounded monthly character allowance before each request, disables automatic retries, coalesces concurrent requests with a database lease and caches bounded MP3 audio for24hours. The frontend requires explicit playback and includes attribution. Provider credentials stay server-side.

The selected deployment is one Node container behind Caddy HTTPS on Vultr, packaged in deploy/compose.yaml. Atlas remains external. No instance is running: the owner's zero-over-credit hard-cap requirement is not met by the observed Vultr limits, and free-compute approval is pending. In-process jobs will run continuously while the selected host is up; Mongo preserves retry state across restarts.

Server approval lives in discord_guilds, keyed uniquely by guild ID. Only the current Discord owner can edit it through Settings; the backend checks both OAuth owner metadata and Discord identity against the bot's guild owner ID. Reads check current membership, ownership continuity and channel visibility. V1 excludes restricted channels by requiring everyone-role View Channel and rejecting any view-denying overwrite. Each student also selects approved channels. Cached private context is filtered against fresh authorization before delivery, and changes clear cached Discord announcements.
