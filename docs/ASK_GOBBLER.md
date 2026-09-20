# Ask Gobbler

Ask Gobbler is a signed-in MyGobbler assistant for event discovery, saved events,
clubs and site help. Gemini interprets questions and writes conversational replies.
The backend owns retrieval, visibility, dates, recommendations, validation and
writes. The assistant has no tools to browse URLs, write providers, register for
events, buy tickets, send messages, or act on another account.

## Current chat and context

The layout-level React context holds only the current browser session's chat. It
survives internal page navigation, clears on New chat, sign-out or reload, and is
never written to localStorage or MongoDB. The UI retains the latest 20 exchanges;
the model receives at most the most recent six exchanges (12 messages). History
is untrusted input, including prior assistant messages and event IDs. Previous
IDs are resolved only against the current public catalog; history grants no access.

Every request loads the authenticated account's stored interests and saved IDs.
The model receives bounded current public event records with saved flags and up
to 12 explicitly confirmed preference facts. No account name, email, user ID,
credentials, private connectors, schedules or feedback records are sent. The user
may nevertheless put personal information in their typed chat, so opt-in explains
what is transmitted and advises against sensitive information. Saving an event
never implies attendance, membership or registration. Missing/withdrawn saves
remain unavailable rather than generating invented event details.

Personalized calls require both `aiEnabled` and `assistantConsentVersion: 1`.
Existing opt-in alone does not authorize the expanded context: Settings presents
the new disclosure. Disabling AI keeps the facts locally and stops their use in
model calls. Users can edit or delete facts separately; account deletion erases
all confirmed facts and confirmation tombstones. Public history remains a separate
read-only search result, not private memory; historical records are not sent to
Gemini by this implementation. Persistent transcripts/automatic inferred memory
are intentionally not implemented.

## Explicit preference confirmation

Gemini may propose an exact quote from the current question expressing an event
preference. The backend checks that the quote occurs in that question and contains
an explicit first-person preference. The UI displays the exact fact and Remember
this / Not now. This does not silently change the interest-category settings.

The backend signs a ten-minute, user-bound preview with HMAC. Only a separate
session-authenticated request with `confirmation: true` can persist that preview.
Model output cannot construct a valid token or invoke that endpoint. Tampered,
expired or wrong-user tokens are rejected. Capacity is enforced transactionally
at 12 facts of up to 240 characters each, including concurrent requests. Replaying
a successful confirmation does not duplicate/overwrite it. Deletion removes text
immediately and leaves a short tombstone so replay cannot resurrect it; the
tombstone expires after the token's possible lifetime. Edits require the existing
text plus explicit confirmation, and stale edits fail. All facts remain untrusted
model context, even after confirmation.

## Live fallback and actions

Friday after 5, Weekend outdoors and Arts & music submit `forceDiscovery: true`
to the backend and NEVER spend Gemini quota. They use the same `currentEvents()`
projection as authenticated discovery, including source withdrawal checks, current
Discord eligibility, interest ranking, date filters and exclusion of cancellations.
Malformed output, unknown/duplicate IDs, inconsistent filters, provider errors,
timeouts, missing consent/configuration, unavailable budget storage and exhausted
quotas return an explicit deterministic notice. Current-catalog cards are returned
only for explicit discovery commands or short date/category filters; otherwise
the fallback offers navigation without an unsolicited event list. Gemini handles
implicit requests such as "I'm bored tonight" and contextual follow-ups. Greetings,
thanks, site help and preference statements return no cards. Prior event requests
do not make later unrelated messages into discovery requests. Operational logs
record only failure categories and provider status codes, never chat content.

Discover, Saved and Preferences use real site navigation. Event cards reuse the
existing Save/Unsave and details flows. Save handlers revalidate event existence;
removal between answer and click returns a real error,
never fabricated success. No invented model URL/action is executable. Answers are
plain text. A source or backend outage cannot be replaced by client-side fixtures.
No application can guarantee an action will never fail, so the UI waits for the
backend receipt and keeps error states recoverable.

## Free-tier deployment gate

Use the existing Gemini API project only after verifying in AI Studio that the
key belongs to a **Free Tier project with billing disabled**. Set the backend-only
`GEMINI_FREE_TIER_CONFIRMED=true` after this check. Without that attestation the
assistant returns live discovery. A key or model name cannot prove project billing
status; application request limits alone cannot prevent charges on a paid project.
Do not link billing, upgrade, or enable a paid fallback.

Only `gemini-3.5-flash-lite` is accepted by this assistant. The Google pricing page
listed free input/output for that model when checked on 2026-09-20. The assistant
uses ordinary text generation: no paid context cache, grounding/search, batch,
file search, or other provider tools. Recheck the provider's model availability
and tier before release. Free-tier prompts/responses may be used to improve
Google products, as disclosed before user opt-in.

Atomic limits are shared across backend processes using MongoDB transactions:

- `GEMINI_DAILY_LIMIT`: default/maximum 100 assistant attempts per Pacific day.
- `GEMINI_USER_DAILY_LIMIT`: default/maximum 20 per user per Pacific day.
- `GEMINI_ASSISTANT_RPM`: default/maximum 4 across users per minute.
- Operators can lower limits; zero or invalid values disable requests.
- Failed attempts count; model calls have a 12-second timeout, one SDK attempt,
  at most 2,400 output tokens and a 48,000-byte input ceiling.
- Budget counters expire after two days; no prompt/response text is stored there.

These are application ceilings, not a promise of provider capacity. Gemini quotas
are project-wide and shared with Discord extraction. Keep that existing per-server
policy intact. Provider 429/503 responses simply fall back without automatic retries.
Set ceilings at or below the project's actual allowance, leaving room for other
users of the project. AI Studio's quota display is the authority.

Sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
[rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[billing](https://ai.google.dev/gemini-api/docs/billing),
[data terms](https://ai.google.dev/gemini-api/terms).

## Contracts, failure behavior and verification

`askAssistant` and its query-only HTTP route remain compatible. The additive
`chatAssistant` route accepts bounded history and explicit discovery mode. ANS
forwards that context on the authenticated transport; the recipient independently
revalidates the user's session. The obsolete v3 `fit` requirement was removed
from the active v5 transport validator. No new agent identity is needed.

`AssistantStateRepository` owns database operations and budget reservations.
`assistantMemories`, `confirmAssistantMemory`, `editAssistantMemory` and
`deleteAssistantMemory` are typed session-owned HTTP operations. Their contracts
describe effects, errors, transaction scope and idempotency. Chat and memory
responses are `Cache-Control: no-store`. Existing v1–v5 baselines are untouched.

Regression tests cover scoped/minimized model context, opt-in and free-tier gates,
malicious history, unknown/duplicate event IDs, forged action claims, external
URLs, off-topic redirection, provider failures without retries, exact campus-time
filters, signed confirmation/tampering/expiry/replays, user isolation, edits,
capacity, account deletion, concurrent budgets, live source withdrawal and actual
save endpoints and the retired calendar endpoint. ANS tests carry current-chat context and nonempty v5
recommendations over verified TLS.

Local browser verification uses a disposable MongoDB and synthetic Gemini replies;
it verifies UI wiring and errors without spending production quota or reading real
profiles. A live-provider smoke test and deployed release verification still require
the real backend credentials and verified free-tier configuration. Do not call a
mocked provider test a successful production Gemini call.

## Operator activation through GitHub Actions

The manual **Activate free-tier Gemini** workflow uses the existing production SSH
secrets. Run it on `main` with `free_tier_confirmed=true` only after the production
key owner confirms Free Tier with billing disabled. It changes only the server's
assistant activation flag, keeps the currently deployed image, recreates the app,
and verifies health and the effective setting. It shares the deployment lock and
workflow concurrency group; failures restore the previous environment. Keys never
leave the server. Each user still enables personalized chat in Settings.
