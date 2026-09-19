# My Little Gobbler

**Your little guide to campus life.** A student-built Virginia Tech campus companion. Not affiliated with or endorsed by Virginia Tech.

## Current delivery status

The application now runs against a real **MongoDB Atlas M0** cluster and **Gemini free-tier API**. Account/profile persistence, live discovery, saves, ICS and grounded Gemini responses were verified end to end on 2026-09-19. **Production V1 is not complete:** the owner chose to keep hosting pending for Vultr under a $0-beyond-credits hard-cap requirement. Vultr free-compute approval, connected-provider setup and deployed HTTPS verification remain outstanding. There is no public deployment URL yet.

Existing private source repository: https://github.com/JARA-org/vtevents. The repository name is preserved; application and service slugs use `my-little-gobbler`.

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
- Better Auth email/password sign-in, persistent profiles, editable interests, recurring availability, one-time busy blocks, saves and feedback.
- Public event discovery, filters, details, provenance, freshness, cancellation handling and cross-source deduplication.
- Deterministic recommendations and grounded Gobbler responses. Optional backend-only Gemini interprets questions and ranks up to 40 public event candidates; unknown IDs are rejected, and explanations and schedule facts come from stored records.
- Schedule conflicts and explicit unknown availability. America/New_York campus display; UTC timestamps and retained source timezone.
- Working ICS download with stable UIDs, escaping and line folding. Connected-calendar confirmation and duplicate prevention.
- OAuth connection paths, encrypted credentials/private context, sync/disconnect, account deletion, analytics outbox and refresh job endpoint.
- Gobbler favicon and optional ElevenLabs narration of up to three stored public event summaries. Authenticated requests, shared audio cache, strict character allowance and explicit playback; no private schedule sent. Live audio and authenticated endpoint verified on the Free plan; TTS-only key capped at 8,000 credits per refresh period.

See [integration status](docs/INTEGRATIONS.md), [architecture](docs/ARCHITECTURE.md), [resource inventory](docs/RESOURCES.md), and [verification walkthrough](docs/VERIFICATION.md).

## Deploy the full Node application

**Selected host: Vultr.** See [Vultr deployment](deploy/README.md) for the Docker/Caddy HTTPS package, cost constraint, free-tier application status and launch verification steps. The Docker engine was unavailable for container execution in this session; the application production build passed. The Render path below remains an unused fallback; the owner explicitly chose to wait for Vultr.

### Unused Render fallback (requires owner to change hosting choice)

1. Sign in to the intended owner’s Render and Atlas accounts. Select Atlas **M0 Free**, never Flex or a paid cluster. Create a database user restricted to `my_little_gobbler`; permit only the selected Render service's documented outbound IP ranges and required development IPs. Do not use `0.0.0.0/0`.
2. Create a Render Blueprint from this private JARA repository using `render.yaml`. It defines one **Free** Node web service serving the Expo export and backend on the same origin. Verify there is **no payment method / billable overage**, or a real hard spending cap, before enabling usage. No paid background worker or cron resource is needed. Render free services sleep after inactivity and can take about a minute to wake.
3. Set `APP_ORIGIN` to the exact assigned HTTPS origin. Configure `MONGODB_URI`, `BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` (64 hex characters), `ANALYTICS_SALT`, and `JOB_SECRET` in secret storage. Render-generated values can cover all except the hex encryption key and external credentials.
4. Create a Gemini key on a project **without billing**. Set `GEMINI_API_KEY` and verify the selected free-tier model. The backend caps requests at `GEMINI_DAILY_LIMIT=100`; provider quotas may be lower. A budget alert alone is not a hard cap. No paid fallback.
5. Configure integration credentials and redirect URLs as described in `docs/INTEGRATIONS.md`. Google sign-in is not required for the app’s own Better Auth email/password accounts.
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

Tests use an isolated disposable MongoDB replica set, synthetic accounts and mocked calendar writes. They do not access personal accounts. See verification notes for performed browser checks and exact limitations.

## Privacy and operational limits

- Passwords are hashed by Better Auth. Session cookies are HTTP-only, secure in production, and protected by trusted origins and origin validation.
- OAuth uses expiring, single-use, user-bound state; Google also uses PKCE. Provider tokens and fetched private context are AES-256-GCM encrypted. Keep the encryption key backed up securely; rotating it requires re-encrypting or reconnecting.
- Shared public event records contain no personal calendar or Discord data. Every private API derives its owner from the authenticated session.
- Gemini receives opted-in typed questions, selected interest categories, and bounded public event text. Calendar contents, user identity, saves, credentials and Discord content are excluded. Its free-tier terms may allow use of prompts for product improvement; this is disclosed before opt-in. Requests have a unique daily budget record and SDK retries are disabled.
- Analytics contains pseudonymous IDs, event IDs, action types and timestamps. No raw calendar text, messages or tokens. Failures queue for bounded retries and do not break the app.
- Demo mode and its browser storage have been removed. Public source links lead to the original listing.
- Account deletion removes account data and credentials and queues remote analytics erasure. A pseudonymous suppression marker is retained to prevent delayed analytics writes from restoring erased activity; erasure retries during outages. Calendar events already written to external services remain in those services. Disconnect attempts token revocation and reports if manual provider revocation is still needed.

Production launch remains gated on cost-safe Vultr hosting, credential rotation, remaining provider testing, campus/server approvals where needed, and final deployed verification. Email verification and password recovery are also still pending before a broad public launch.
