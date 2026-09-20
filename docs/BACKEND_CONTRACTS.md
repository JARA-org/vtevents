# Backend interface guide

The canonical definitions are in `packages/shared/src/contracts.ts`. This is a
shared **type-only** package. `apps/frontend/services/backend.ts` implements the
browser transport. `apps/backend/src/contract-check.ts` checks implemented domain
outputs against those types during compilation.

## Implemented public functions

Each `HttpApi` entry includes input, output, route, and effects. The browser's
`BackendClient` excludes worker jobs. Existing event and account response shapes are preserved; see the v3 retirement below.

| Responsibility  | Functions                                                              | Effects / ownership                                                                     |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Application     | health, bootstrap                                                      | Read server status and form/category defaults                                           |
| Events          | listEvents                                             | Read listings                                 |
| Discovery       | discover, getRecommendations                                           | Backend search, date filtering, ranking and saved-event projections       |
| Account         | getAccount, updateProfile, validateProfile, deleteAccount              | Session-owned persistence; validation is pure; deletion is irreversible                 |
| Preferences     | setSaved, submitFeedback                                               | Persist desired state/feedback; enqueue associated analytics                            |
| Assistant       | askAssistant                                                           | Authenticated matching may spend model budget                                           |
| Discord         | listDiscordChannels, selectDiscordChannels                             | Verify server/channel access; persist allowed selections                                |
| Analytics       | track                                                                  | Pseudonymous outbox enqueue, eventual external delivery                                 |
| Authentication  | signUp, signIn, signOut                                                | Better Auth owns account/session/cookie changes                                         |
| Maintenance     | runJobs                                                                | Server-only refresh and outbox processing                                               |

Transport inputs use strings for dates and IDs. JSON endpoints return their
declared DTO directly. Errors use a non-2xx HTTP
status and `ApiError.message`; optional structured error fields are reserved for
future additive support. Validation errors are 400, session failures 401, access
failures 403, missing records 404, conflicts 409, and unavailable services 5xx.

The typed client is a compile-time boundary, not runtime trust. The backend still
validates untrusted requests, checks permissions and determines side effects.
Do not add arbitrary JSON fields to database update objects. A successful HTTP
response is required before UI treats a live mutation as committed.

## Planned interfaces (not implemented routes)

`PlannedBackendServices` covers capabilities, event details/history, sports ticker,
clubs/news, conversations/messages, personal memory,
operation receipts, and account export. These are specifications for subsequent
implementation. There are no browser stubs that return fake success.

- Queries return records or cursor pages and do not implicitly refresh providers.
- AI conversation/extraction may spend budget and must be declared accordingly.
- Message and memory writes use caller scope; conversation deletion reports
  separately retained memories instead of silently implying all memory is erased.
- Unknown dates remain unknown; precision metadata supplements existing event
  fields without removing the v1 `start` field. A future end-only representation
  needs an explicit adapter or version, never a fabricated confirmed start.
- Sports coverage links, scores, sport names, and event states are optional
  enrichment. Their presence in the contract does not mean ingestion supports them.

## Backend module boundaries

`BackendModules` declares source adapters, event/profile/preference repositories,
coordinator, extraction, recommendations, identity, assistant, conversations/memory, clubs, news, analytics,
and jobs. Each port documents its allowed effects and return value.

The current backend remains a set of flat modules, with persistence still present
in `app.ts`, `coordinator.ts`, and source modules. Those existing dependencies
are listed explicitly in the architecture checker. This change does not pretend
to have implemented all planned ports or migrated every database access. Future
changes should extract the relevant repository/adapter rather than expand that
coupling. Importing another module grants access to its declared exports, not its
private implementation or mutable data structures.

Source batches explicitly describe coverage, completeness, pagination, rejects,
visibility, and source update times. Reconciliation plans contain proposed
upserts, retirements, aliases and conflicts; repository commit is a separate
atomic compare-and-swap operation. Extraction proposes evidence and cannot write
canonical events or broaden a record's visibility. Private context is composed
for authorized users after public reconciliation, not published globally.

## Compatibility and extension policy

1. Keep every existing field/type/nullability and semantic meaning.
2. Add optional DTO fields. Missing means unavailable/not provided; `null` means
   explicitly unknown/empty where the existing field permits it. Empty lists mean
   known empty, not a provider failure.
3. Clients ignore unknown fields; no exhaustive assumption about unrelated payload
   keys. New operations may be added without changing old ones.
4. Changing existing enum values, required input fields, units, timestamp meaning,
   or response envelopes requires a parallel major version and migration.
5. Use optional namespaced `extensions` for JSON metadata; core data remains typed.
   Runtime validators must be updated explicitly before accepting new write fields.
6. `tests/fixtures/contracts-v1.json` is the original compatibility floor. The
   checker rejects removed/changed declarations, altered inherited fields, and
   new required DTO fields. Never overwrite it to accommodate a breaking change.

## Enforcement and validation

`npm run check:architecture` rejects executable shared code, runtime shared
imports in the frontend, imports outside UI boundaries, non-UI dependencies,
frontend network calls outside the transport, and undeclared backend dependencies.
It also rejects known migrated business operations if copied back into UI.

`npm run check:contracts` checks the preserved v1–v4 definitions and the active v5 floor. Both run as part of typecheck,
tests, and build, including the existing CI workflow. Static checks cannot prove
that arbitrary new code is free of business logic; review remains mandatory.

Tests exercise server discovery, request validation and session
isolation, type compatibility, and intentional boundary violations. Ranking,
matching run on the backend. A static-only deployment
cannot run those features; host Node and frontend together or route `/api` to Node.

Repository-wide instructions are in `AGENTS.md`, with `agent.md` pointing to it.

## Historical v2 migration

The explicitly requested removal of demo mode retires anonymous event discovery,
client-supplied discovery profiles/preferences, and the demo assistant endpoint.
That contract advertised version 2. Previous definitions remain in
`packages/shared/src/legacy/contracts-v1.ts`, checked against the unchanged
`contracts-v1.json` reference; this is a historical type reference, not a running
legacy/demo API. Deploy frontend and backend together. Existing signed-in calls
retain their response fields except the explicitly retired demo bootstrap field.
Its historical compatibility floor is `tests/fixtures/contracts-v2.json`.
Do not overwrite either floor to bypass failures.

Voice (`narrate`) returns opaque audio bytes and MIME type, an explicit non-JSON
transport exception. The server validates up to 40 candidate IDs and narrates the
first three unique public events; budget reservation and provider/cache effects
stay on the backend. Discord owner operations list owned servers, retrieve allowed
channels, and persist validated policy with cache invalidation. Their routes,
inputs, outputs and effects are declared in `HttpApi`; internal ownership is
specified by `NarrationService` and `DiscordPolicyService`.

## Discord server-bot migration

The user's revised design retires Discord account linking and its channel-owner
HTTP operations. Those historical DTOs remain for compatibility/reference;
channel-management and all generic account connection routes return 410. New bot commands use `DiscordBotRepository`, independent
of app-user identity. The bot only reads Discord resources: app-side watch,
unwatch, individual submission, and exclusion policies never mutate Discord
settings or messages. No collector/model is enabled in this first milestone.
See `DISCORD_BOT.md` for the migration and setup.

## Discord collection and online attendance

`CampusEvent` adds optional `onlineUrl?: string | null` and `isOnline?: boolean`.
Neither replaces `location`; hybrid events carry both. Missing new fields preserve
old behavior. `onlineUrl` must be an HTTP(S) attendance link without embedded
credentials. `isOnline` supports known-online events with an unavailable link.
Runtime validation and event details preserve the link. Existing `sources[].url` remains the evidence/source URL.

New backend ports separate GET-only Discord transport (`DiscordMessageReader`),
persistence/leases/budgets (`DiscordCollectionRepository`), interpretation
(`DiscordTextExtractor`), and deterministic qualification. `DiscordEventCandidate`
is a staging DTO with a full local date and evidence; it is not `CampusEvent` and
has no invented start timestamp. Pending/rejected text is never returned as an
event. Collection stores qualified proposals for subsequent consolidation; no new
public message-content endpoint is added.

Discord inspection and quota contracts: `DiscordInspectionService.inspect` returns channel-scoped `DiscordCollectionInspection` without writes or AI. `DiscordCollectionRepository.reserveExtraction` atomically reserves a `DiscordExtractionReservation` under `DiscordExtractionLimits`, returns a boolean, and never refunds model failures. These backend-only ports preserve existing event fields and frontend boundaries.

The active Discord policy sets additive `DiscordExtractionLimits.serverOnly=true`: only guild hourly/daily fields govern spending, with durable revision idempotency. Absence preserves legacy reservation semantics for old callers. Existing global/message fields and the legacy reserveAI port remain compatibility-only; the active worker never invokes that port. New watch selections use the signed interaction ID as a chronological lower bound; existing selections migrate from their stored activation timestamp.

Club account boundaries: `ClubAccountService` owns creation, access control, event reads and server binding; `DiscordClubSetupService` accepts only signed/permission-checked guild identity through the bot adapter and mints short-lived hashed setup tickets. `myClubs`, `createClub`, `clubWorkspace`, and `linkClubDiscord` are implemented session-protected HTTP operations and typed client calls. Creation and linking use MongoDB transactions and unique owner/request and server indexes. Unauthorized access, expired tokens and conflicting links fail without partial creation. Reads never invoke AI. This does not implement the planned claiming or event-editing services.

Club listing now includes additive `canCreate?: boolean`; absence means creation is unavailable in the UI. Club creation is serialized per owner and rejects a second club with HTTP 409 while preserving original-request retries. This constraint is backend-owned, including concurrent requests; existing duplicate records are preserved for explicit future reconciliation.

`DiscordPublicationService.list` is a read-only publication projection over persisted qualified source records, current consent and saved owner corrections. It invokes no model or provider. `ClubWorkspace.editableEvents` adds backend-prepared form values and revisions; the legacy candidates array remains present but the HTTP workspace returns it empty. `editClubEvent` is a session-protected PATCH with strict validation, owner-only authorization, revision checking, atomic correction/audit writes and no provider effects. Retries with a consumed revision return conflict rather than silently overwriting. Discord publications stay separate from imported-feed snapshot persistence and retain stable IDs across updates.

`DiscordMessageTrigger` is an ID-only Gateway notification. `DiscordTriggerQueue` owns durable coalescing, due-job leases, race-safe completion and deletion withdrawals; none of its operations invoke AI. The existing collector accepts optional exact targets for event-driven processing and never scans history in that mode. The legacy polling port remains for compatibility/tests but production schedules only triggered queue work. `DiscordCollectionInspection.listenerStatus` is additive; absence indicates the older server implementation.

`DiscordTextExtractor.propose` accepts additive optional `DiscordExtractionContext` (trusted postedAt/timezone). `DiscordEventCandidate.dateReasoning` is optional and required by runtime validation for inferred dates; explicit-date callers remain compatible. The collector and publication service validate inferred dates with the original message timestamp, never edit or processing time. Fingerprints include context and extraction-policy version. Model interpretation handles language; ordinary backend validation handles obvious calendar arithmetic and weekday consistency.


### Implemented personal memory

GET /api/memory returns only the authenticated caller's stated interests, inferred category counts, attendance and recent saved past-event confirmation candidates. PUT /api/memory/attendance/:eventId accepts only { attended: boolean }; true validates a reachable, non-cancelled event that has started, while false removes that caller's record. Repeated confirmation preserves its initial timestamp; a per-user transaction serializes count checks and upserts, with a unique user/event index and a 200-record limit. Invalid input, unavailable storage, missing events and capacity exhaustion fail explicitly. No provider writes or model calls occur in these operations.

DELETE /api/memory accepts { scope: "attendance" | "all" }; both clear the attendance owned by this service and derived interests. Profile interests remain managed through the profile API. Account deletion also removes attendance. Reads have no refresh or model effects. The optional events argument of UserMemoryService.view is a backend-owned, consent-checked public projection; it is never accepted from browser JSON. Route orchestration resolves archived availability and excludes withdrawn records from derived interest context. Confirmation responses return authoritative state; reads after a concurrent later mutation may reflect that mutation.

Assistant replies optionally include clubHistory and usedMemory. History requires actual clubId associations for managed identities; observed organizer matches convey no ownership. Dates, source links and category comparisons come from stored records, not unconstrained generated prose. The existing AI setting controls external model transmission. Chat transcript persistence and automatic conversation-memory extraction remain planned.

CreateManagedClubInput.discordTicket stays optional in the shared historical shape for compatibility, but new workspace creation requires a valid Discord setup ticket under current policy. Existing successful request replay and linking an older unlinked workspace remain supported. No GobblerConnect ownership claim or editing API is advertised.


### Local analytics

The existing authenticated analytics operation now records pseudonymous interaction metadata only in MongoDB. Its public input/output shape is unchanged. The historical `outbox` collection retains a 30-day TTL but has no exporter, remote SQL client, credentials, retry worker, or provisioning step. Account deletion removes local interactions and retains a suppression marker for late requests. The later v3 migration retires the connections-status route; it is no longer an analytics status surface. This does not add model training or change recommendation scoring.

## Historical v3 migration

The user-authorized retirement removes campus provider connections, private provider
context and remote calendar writes. `contracts.ts` now advertises version 3 and
contains only the remaining operations; the browser transport has no connection
methods. Existing v1 and v2 definitions live under `src/legacy/` and their original
JSON baselines are unchanged. The new v3 floor is `tests/fixtures/contracts-v3.json`.
These historical files are type references, not running integrations.

Deploy frontend and backend together. The old connection, callback, sync,
private-context and remote-write routes require authentication and return HTTP 410
with a refresh message. They never read credentials, exchange codes, contact a
provider or mutate provider state. Other account/event routes retain their behavior.
The bootstrap version is 3; stale clients must refresh for the current feature set.

Profile reads ignore retired non-manual busy blocks before validation, so they
cannot affect recommendations or lock out an existing account. New profile writes
accept only manual busy blocks. There is no private-context merge, credential
refresh, provider sync job or provider ANS role. Account deletion still removes
historical local connection/context/write/state records to avoid orphaning private
data. This change does not connect to a production database or revoke grants at
external services; any persisted historical records remain unread until account
deletion. No source text is moved into public event records.

Onboarding asks only for interests. Manual availability remains on the schedule
and preferences pages. Calendar-file export remains backend-generated and has no
provider effects. Campus listing status uses friendly presentation labels while
backend health retains accurate diagnostic status and errors.


## Historical v4 migration

The user's clarified request removes the entire personal scheduling feature.
There is no Schedule page, availability editor, busy/free form, conflict badge,
fit classification, time-coverage arithmetic, schedule projection or ranking bonus/
penalty based on personal time. Assistant prompts and explanations use event facts
and interests. Event dates, the discovery date selector and ICS export remain.
“Add to calendar” still downloads a backend-generated file for the chosen event.

`Profile` contains name, interests and opt-in/onboarding flags. `Recommendation`
contains event, score and reason; `DiscoveryView` has no schedule projection.
`SchedulingService` and preview operations are removed from active types/client.
The former preview endpoint requires a session and returns 410 without domain
side effects. Other authenticated event/account operations remain available.
Older profile payloads have unknown obsolete fields stripped on validation; those
fields are never used, returned or accepted as personal-time data.

The backend clears obsolete stored blocks on startup, atomically per profile and
idempotently across restarts, without changing preferences, saved events or other
account fields. Empty legacy storage columns are retained solely so the previous
release can load accounts if deployment rolls back. Profile writes also keep those
columns empty. No provider calls or AI spending are involved in this migration.

Deploy frontend and backend together and reload open tabs. Bootstrap advertises
version 4. The v1/v2/v3 contracts and original fixtures are immutable historical
references; the current compatibility floor is `tests/fixtures/contracts-v4.json`.


## Active v5 migration

The user has now retired all Add to calendar actions, including the timeline
button, event-details button, download panel, native sharing, landing-page copy
and assistant suggestions. This supersedes the v4 exception for ICS downloads.
Discovery, event dates, date filtering, saved events and source links remain.
Public ICS ingestion still reads campus listings; it is unrelated to personal
calendar export and remains an internal source adapter.

Contract v5 removes `HttpApi.exportCalendar`, the `CalendarService` port,
`BackendModules.calendar`, `SuggestedAction.prepare_calendar` and the
`calendar_addition` analytics kind. The v4 definitions are frozen under
`packages/shared/src/legacy/contracts-v4.ts`, with their original fixture unchanged.
The new immutable v5 baseline is separate. Bootstrap advertises version 5.

Frontend and backend ship together. For cached older clients, authenticated
`GET /api/events/:id/ics` returns 410 `FEATURE_RETIRED` with no file, event lookup,
provider access, analytics or other effects, regardless of event ID. Anonymous
requests still require sign-in. Repeating the request is safe. Retired analytics
submissions fail validation without enqueueing. No stored account or event data
needs migration, and no external calendar is contacted or modified.
