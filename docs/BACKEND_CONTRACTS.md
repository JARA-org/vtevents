# Backend interface guide

The canonical definitions are in `packages/shared/src/contracts.ts`. This is a
shared **type-only** package. `apps/frontend/services/backend.ts` implements the
browser transport. `apps/backend/src/contract-check.ts` checks implemented domain
outputs against those types during compilation.

## Implemented public functions

Each `HttpApi` entry includes input, output, route, and effects. The browser's
`BackendClient` excludes worker jobs and the provider callback. Existing HTTP
response shapes are preserved; new view endpoints are additive.

| Responsibility  | Functions                                                              | Effects / ownership                                                                     |
| --------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Application     | health, bootstrap                                                      | Read server status and form/category defaults                                           |
| Events          | listEvents, exportCalendar                                             | Read listings; serialize ICS without writing a calendar                                 |
| Discovery       | discover, getRecommendations                                           | Backend search, date filtering, ranking, schedule fit, saved/schedule projections       |
| Account         | getAccount, updateProfile, validateProfile, deleteAccount              | Session-owned persistence; validation is pure; deletion is irreversible                 |
| Availability    | previewAvailability                                                    | Normalize and validate a form draft, including local timezone ambiguity; no persistence |
| Preferences     | setSaved, submitFeedback                                               | Persist desired state/feedback; enqueue associated analytics                            |
| Assistant       | askAssistant                                                           | Authenticated matching may spend model budget                                           |
| Connections     | listConnections, connect, finishConnection, syncConnection, disconnect | OAuth state/tokens, provider reads, private snapshots, revocation                       |
| Discord         | listDiscordChannels, selectDiscordChannels                             | Verify server/channel access; persist allowed selections                                |
| Private context | getPrivateContext                                                      | Return only the session owner's context, never tokens                                   |
| Calendars       | addCalendar                                                            | Confirmed provider write with persisted deduplication state                             |
| Analytics       | track                                                                  | Pseudonymous outbox enqueue, eventual external delivery                                 |
| Authentication  | signUp, signIn, signOut                                                | Better Auth owns account/session/cookie changes                                         |
| Maintenance     | runJobs                                                                | Server-only refresh and outbox processing                                               |

Transport inputs use strings for dates and IDs. JSON endpoints return their
declared DTO directly. ICS returns `text/calendar`; OAuth callback redirects to
the declared destination (it is not a JSON endpoint). Errors use a non-2xx HTTP
status and `ApiError.message`; optional structured error fields are reserved for
future additive support. Validation errors are 400, session failures 401, access
failures 403, missing records 404, conflicts 409, and unavailable services 5xx
(existing provider-expiry paths can return 409).

The typed client is a compile-time boundary, not runtime trust. The backend still
validates untrusted requests, checks permissions and determines side effects.
Do not add arbitrary JSON fields to database update objects. A successful HTTP
response is required before UI treats a live mutation as committed.

## Planned interfaces (not implemented routes)

`PlannedBackendServices` covers capabilities, event details/history, sports ticker,
clubs/news, conversations/messages, personal memory, editable calendar drafts,
operation receipts, and account export. These are specifications for subsequent
implementation. There are no browser stubs that return fake success.

- Queries return records or cursor pages and do not implicitly refresh providers.
- AI conversation/extraction may spend budget and must be declared accordingly.
- Calendar draft preparation/editing cannot create provider events. Commit needs
  explicit confirmation, a revision, and an idempotency key.
- Message and memory writes use caller scope; conversation deletion reports
  separately retained memories instead of silently implying all memory is erased.
- Unknown dates remain unknown; precision metadata supplements existing event
  fields without removing the v1 `start` field. A future end-only representation
  needs an explicit adapter or version, never a fabricated confirmed start.
- Sports coverage links, scores, sport names, and event states are optional
  enrichment. Their presence in the contract does not mean ingestion supports them.

## Backend module boundaries

`BackendModules` declares source adapters, event/profile/preference repositories,
coordinator, extraction, scheduling, recommendations, identity, connections,
private context, calendar, assistant, conversations/memory, clubs, news, analytics,
and jobs. Each port documents its allowed effects and return value.

The current backend remains a set of flat modules, with persistence still present
in `app.ts`, `coordinator.ts`, and integration modules. Those existing dependencies
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

`npm run check:contracts` checks the preserved v1 definitions and the active v2 floor. Both run as part of typecheck,
tests, and build, including the existing CI workflow. Static checks cannot prove
that arbitrary new code is free of business logic; review remains mandatory.

Tests exercise server discovery/availability, request validation and session
isolation, type compatibility, and intentional boundary violations. Ranking,
matching and ICS generation run on the backend. A static-only deployment
cannot run those features; host Node and frontend together or route `/api` to Node.

Repository-wide instructions are in `AGENTS.md`, with `agent.md` pointing to it.

## Active v2 migration

The explicitly requested removal of demo mode retires anonymous event discovery,
client-supplied discovery profiles/preferences, and the demo assistant endpoint.
The active contract advertises version 2. Previous definitions remain in
`packages/shared/src/legacy/contracts-v1.ts`, checked against the unchanged
`contracts-v1.json` reference; this is a historical type reference, not a running
legacy/demo API. Deploy frontend and backend together. Existing signed-in calls
retain their response fields except the explicitly retired demo bootstrap field.
The active additive compatibility floor is `tests/fixtures/contracts-v2.json`.
Do not overwrite either floor to bypass failures.

Voice (`narrate`) returns opaque audio bytes and MIME type, an explicit non-JSON
transport exception. The server validates up to 40 candidate IDs and narrates the
first three unique public events; budget reservation and provider/cache effects
stay on the backend. Discord owner operations list owned servers, retrieve allowed
channels, and persist validated policy with cache invalidation. Their routes,
inputs, outputs and effects are declared in `HttpApi`; internal ownership is
specified by `NarrationService` and `DiscordPolicyService`.
