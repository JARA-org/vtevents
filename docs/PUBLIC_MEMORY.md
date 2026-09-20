# Public event memory

`public-memory.ts` records already reconciled public events and deadlines in MongoDB. It does not collect websites, call models, access personal connectors or decide that an organizer owns a club.

Each record has an immutable content revision and a current head. Repeated fetches with changed observation timestamps cause no writes at all, including to the head and organizer history. First/last seen timestamps refer to content observations that changed history, not polling activity. Actual content changes, cancellation, explicit provider updates and deadline withdrawals create revisions. Historical records survive omission from a later partial snapshot. A batch is validated before writes, then committed with organizer history in one transaction; retrying the same content is idempotent.

Observed organizer records retain source links and event IDs and are explicitly unverified. A managed club ID can associate history but cannot establish verified ownership. Matching organizer names across different source origins does not merge identities. Descriptions explain the evidence available; they do not invent missions, members or affiliations.

Search is read-only, literal and bounded. It returns current heads including past events and cancellations, up to 40 events, 40 deadlines and 20 organizers. It does not expose every historical revision or private user data. Private visibility and personal-provider provenance are rejected, and arbitrary extension/credential fields are excluded from storage.

An explicit public-source deletion or opt-out requires `withdrawPublicMemory` to remove current and historical event copies and organizer associations. Omission alone is deliberately not deletion. The caller must serialize withdrawals with ingestion and prevent an excluded event from being submitted again; this store does not own source eligibility. Do not feed revocable Discord contributions into persistent history until its live exclusion/deletion path is wired to this lifecycle. Routine public-web history and private calendar context remain separate.
