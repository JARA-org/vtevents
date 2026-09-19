# Architecture

```text
Expo Router / React Native web
        | same-origin HTTPS + HttpOnly session cookie
Node.js / Express / TypeScript
        + Better Auth ----- MongoDB Atlas (production, pending)
        + source modules -- GobblerConnect official ICS / VT Sports JSON-LD
        + coordinator ----- normalize / validate / deduplicate / cache
        + schedule engine - America/New_York recurring intervals + private busy blocks
        + Gobbler --------- Gemini structured query filters / deterministic fallback
        + integrations ---- Google OAuth+PKCE / Canvas OAuth / Discord OAuth+bot
        + jobs ------------ refresh public/private data + retry analytics
        + outbox ---------- Databricks Statement Execution API
```

`apps/frontend` contains Expo UI; `apps/backend/src` contains the modular Node backend; `packages/shared/src` contains Zod schemas, scheduling logic, ICS generation, and explicitly separate demo fixtures.

Collections: public `events`; private `profiles`, `saved`, `feedback`, `connections`, `private_context`, `calendar_writes`, `oauth_states`; operational `outbox`, `ai_budget`; Better Auth's `user`, `session`, `account`, `verification`. Unique indexes enforce user/event write identity. OAuth state expires through both query checks and a Mongo TTL index.

Event times are UTC ISO timestamps with original source timezone. Public source metadata includes IDs, URLs and fetch timestamps. Sports metadata sometimes encodes unannounced times as placeholders: `timeTBD` prevents those being treated as confirmed times. Missing end times are not invented. Availability is only free when explicit free intervals cover the event and no known busy interval overlaps. Busy periods override free periods; adjacent endpoints do not overlap.

Google writes use deterministic SHA-256 IDs accepted by Google Calendar, plus a unique database write record. Repeated requests return the completed record. Canvas lacks documented remote idempotency keys: an ambiguous failure retains its pending lock; an operator must reconcile it against the external calendar before unlocking. This prevents blind duplicate retries at the expense of manual recovery.

Untrusted descriptions are plain text. Gemini produces constrained filter JSON, validated with Zod, and has no tools. Only normal application code selects real records, computes conflicts, accesses databases, or writes calendars. The backend never executes instructions contained in event descriptions.

Free hosting cannot guarantee uninterrupted jobs. In-process refresh runs when awake; the optional six-hour Actions trigger wakes the Node service after billing constraints are verified. Outbox records survive process restarts in MongoDB. Databricks insertion uses MERGE by operation ID, making retries idempotent.
