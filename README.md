# My Gobbler

**Your campus. Your kind of day.** A student-built Virginia Tech campus companion. Not affiliated with or endorsed by Virginia Tech.

## Current delivery status

**Live: https://vtevents.us.** The Expo website and Node API run on the existing Vultr server with Caddy HTTPS, MongoDB Atlas M0 and Gemini free-tier API. Production account/profile persistence, live discovery, saves, ICS, grounded Gemini responses and account deletion passed on 2026-09-19. Browser onboarding, details and mobile calendar download passed; profiles, saves and sessions survived an app restart.

**Current scope:** authenticated event discovery and saved plans. Setup asks for interests only. Provider account connections and remote calendar writes remain retired; personal scheduling and calendar actions are removed in contract v5. See [the migration](docs/BACKEND_CONTRACTS.md#active-v5-migration) and [current handoff](NEXT_AGENT_PROMPT.md) before operating the deployment. The owner's $0-beyond-credits requirement remains in force; Vultr hard spending protection is still unverified.

Existing private source repository: https://github.com/JARA-org/vtevents. The repository name is preserved; the application display name and app slug are `My Gobbler` / `my-gobbler`. Existing cloud resource names retain their original identifiers for compatibility. See `CHANGELOG.md` and `MAKEOVER_HANDOFF.md` for the local visual refresh.

## Run locally

Requires Node 22.22+ and npm. From this repository:

```sh
npm ci --include=dev
npm run build
npm run local
```

Open http://localhost:3000. `local` starts a real local MongoDB replica set for development when `MONGODB_URI` is absent. The first run downloads the official MongoDB binary. Development data and generated secrets stay in ignored `work/`. This is **not** Atlas or a production database. Stop with Ctrl+C. Event discovery requires a signed-in account and a configured database.

For Atlas, copy `.env.example` to ignored `.env`, fill real backend values securely, and run `npm run dev` or `npm start` after building. Do not retain the example Mongo URI as a real value. `npm run web` starts Expo's development server, but use the same-origin Node server for authentication/integration QA. Mobile store builds are outside V1.

## What works

- Responsive Expo Router/React Native/TypeScript website, original turkey mascot, landing page and required account sign-in.
- Better Auth email/password sign-in, persistent profiles, editable interests, saves and feedback.
- Public event discovery, filters, details, provenance, freshness, cancellation handling and cross-source deduplication.
- Ask Gobbler provides optional Gemini chat grounded in current events, interests, saved events and explicitly confirmed preferences. Its live-discovery buttons work without AI. See [Ask Gobbler](docs/ASK_GOBBLER.md) for consent, limits and the free-tier deployment gate.
- America/New_York event display, UTC timestamps and retained source timezone.
- Account deletion, analytics outbox and public source refresh job endpoint.
- Gobbler favicon and optional ElevenLabs narration of up to three stored public event summaries. Authenticated requests, shared audio cache, strict character allowance and explicit playback; no private account details sent. Live audio and authenticated endpoint verified on the Free plan; TTS-only key capped at 8,000 credits per refresh period.

See [integration status](docs/INTEGRATIONS.md), [architecture](docs/ARCHITECTURE.md), [resource inventory](docs/RESOURCES.md), and [verification walkthrough](docs/VERIFICATION.md).

## Deploy the full Node application

**Selected host: Vultr.** See [Vultr deployment](deploy/README.md) for the live release, Docker/Caddy operations, cost constraint and launch checks. Source revision `55e3420` is deployed at `/opt/vtevents/releases/55e3420`, with `/opt/vtevents/current` pointing there. Linux preflight, production image build and all seven public HTTPS smoke checks passed. The Render path below remains an unused fallback; changing hosting requires the owner's direction.

### Unused Render fallback (requires owner to change hosting choice)

1. Sign in to the intended owner’s Render and Atlas accounts. Select Atlas **M0 Free**, never Flex or a paid cluster. Create a database user restricted to `my_little_gobbler`; permit only the selected Render service's documented outbound IP ranges and required development IPs. Do not use `0.0.0.0/0`.
2. Create a Render Blueprint from this private JARA repository using `render.yaml`. It defines one **Free** Node web service serving the Expo export and backend on the same origin. Verify there is **no payment method / billable overage**, or a real hard spending cap, before enabling usage. No paid background worker or cron resource is needed. Render free services sleep after inactivity and can take about a minute to wake.
3. Set `APP_ORIGIN` to the exact assigned HTTPS origin. Configure `MONGODB_URI`, `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` (64 hex characters), `ANALYTICS_SALT`, and `JOB_SECRET` in secret storage. Render-generated values can cover all except the hex encryption key and external credentials.
4. Create a Gemini key on a project **without billing**. Set `GEMINI_API_KEY` and verify the selected free-tier model. The backend caps requests at `GEMINI_DAILY_LIMIT=100`; provider quotas may be lower. A budget alert alone is not a hard cap. No paid fallback.
5. Configure supported service credentials as described in `docs/INTEGRATIONS.md`. App accounts use Better Auth email/password sign-in.
6. Build command: `npm ci --include=dev && npm run build`. Start: `npm start`. Health: `/api/health`. Verify the HTTPS core flow with a disposable account, then delete that account.
7. Refresh runs hourly while the process is awake and at startup. To refresh sleeping services every six hours, verify included GitHub Actions minutes and hard cost constraints, set repository variable `GOBBLER_URL`, secret `GOBBLER_JOB_SECRET`, and variable `GOBBLER_JOBS_ENABLED=true`. The scheduled workflow invokes `/api/jobs`. GitHub schedules are best-effort. Checks are manually dispatched until organization billing constraints are verified.

Do not use `npm run local` in deployment: its database is development-only and Render disks are ephemeral.

## Optional preview publication

The frontend requires the Node backend for authenticated app behavior. Static-only
previews no longer run matching, fixtures, or calendar generation in the browser.
Use the full same-origin deployment or a preview host that routes `/api` to the
backend. The `EXPO_PUBLIC_PREVIEW_ONLY` flag only displays a preview banner; it
is not a substitute for the backend. Public snapshot files are data artifacts,
not a client-side business-logic fallback.

Read [AGENTS.md](AGENTS.md) and [the contract guide](docs/BACKEND_CONTRACTS.md)
before changing application interfaces.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

Tests use an isolated disposable MongoDB replica set, synthetic accounts and provider-retirement checks. They do not access personal accounts. See verification notes for performed browser checks and exact limitations.

## Privacy and operational limits

- Passwords are hashed by Better Auth. Session cookies are HTTP-only, secure in production, and protected by trusted origins and origin validation.
- Shared public event records contain no personal calendar or Discord data. Every private API derives its owner from the authenticated session.
- Gemini chat requires the expanded user opt-in and a verified free-tier project. It receives bounded current-chat context, interests, public event details with saved flags, and confirmed preference facts; account identity and credentials are excluded. No transcripts are persisted. See [Ask Gobbler](docs/ASK_GOBBLER.md).
- Analytics contains pseudonymous IDs, event IDs, action types and timestamps. No raw calendar text, messages or tokens. Failures queue for bounded retries and do not break the app.
- Demo mode and its browser storage have been removed. Public source links lead to the original listing.
- Account deletion removes account data and credentials and queues remote analytics erasure. A pseudonymous suppression marker is retained to prevent delayed analytics writes from restoring erased activity; erasure retries during outages. Historical retired-connection records are also deleted locally; there are no remote provider calls.

Production launch remains gated on cost-safe Vultr hosting, credential rotation, remaining provider testing, campus/server approvals where needed, and final deployed verification. Email verification and password recovery are also still pending before a broad public launch.

Account recovery UI and encrypted mail outbox are implemented. Configure backend
`RESEND_API_KEY` and verified `AUTH_EMAIL_FROM` together to enable delivery;
otherwise `/recover` clearly reports unavailable. See docs/INTEGRATIONS.md for
free-plan setup dependencies and verification limits.

The authenticated For you page opens a seven-day timeline selector. Its entrance
plays on every fresh page load (and is skipped for reduced motion). Drag from
any day to another, or use the day buttons with the keyboard, then confirm. The
backend selects up to ten upcoming events, weights the first day twice as heavily,
prioritizes explicit interests and otherwise varies categories, organizers and
source families. No model calls or invented popularity signals are used.

Desktop/landscape displays about five bubbles above and five below the rail.
Portrait mobile uses a draggable/scrollable vertical rail. Hover, focus or tap a
bubble to expand its location, small thumbnail and existing actions. Change dates
returns to the selector; Discover more opens the original two-column discovery
grid with all date/category/search filters reset. See docs/TIMELINE.md for behavior,
API scope and verification details. Native app builds retain the discovery grid;
the cinematic interaction is implemented for the Expo website.
