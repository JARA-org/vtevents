> Current scope, September 20, 2026: provider account connections and remote calendar writes are retired. Setup collects interests only; manual availability and ICS export remain. Older deployment/checkpoint notes below are historical and must not be used to resume provider setup. See [v3 migration](../docs/BACKEND_CONTRACTS.md#active-v3-migration). Check the GitHub Actions deployment run for the release status of this source revision.

## Verified live hardening release — 2026-09-19 23:57 UTC

Production now runs **3fc68ee** from `/opt/gobbler-releases/3fc68ee`.
Both app and Caddy Compose services use this directory; Caddy's identical config
was remounted from the valid new path, retaining existing TLS certificate volumes.
Teammate checkout `/opt/vtevents` remains untouched. Old image55e3420 remains for
rollback; run Compose from the NEW directory with GOBBLER_DOMAIN=vtevents.us and
GOBBLER_IMAGE=my-little-gobbler-app:55e3420 to roll back the app only.
The old /opt/vtevents/releases and /opt/vtevents/current paths DO NOT exist.
Production secrets were recovered privately from the running container into a
mode0600 .env.production in the new release, preserving identity/encryption keys.

59/59 tests, typechecks, contracts, local build and actual-host Docker build pass;
production dependency audit reports zero vulnerabilities. All seven HTTPS smoke
checks pass after app AND Caddy replacement. Fresh signup/preferences/discovery/
save/ICS/real Gemini/grounding/account deletion passed against production, with
1,513 current events. Temporary QA account deleted. Browser visual recheck was
unavailable (CUA browser session disconnected); no new UI was authored here.

User supplied Downloads/env has new Discord settings plus different auth,
encryption and analytics secrets. It has NOT been applied. Explicit question
pending: apply Discord settings only while retaining production secrets, or leave
Discord disabled. Never copy that file wholesale. Current Discord remains disabled.
Keep teammate Discord implementation intact. Google/Canvas live calendar consent,
mail delivery/account recovery, Databricks, club deletion cleanup and Vultr spending
protection/API-key rotation remain unfinished. This release is hardening, not full V1.

# Verification and hackathon walkthrough

## Final release update — 2026-09-19

Deployed **55e3420** after integrating upstream Discord Gateway/club/publication changes. **50/50 tests**, architecture/contracts and typechecks passed; actual-host production Docker build passed. API fixture now explicitly blanks optional credentials to avoid inheriting real local Google configuration. Production dependency audit: zero vulnerabilities. HTTPS smoke7/7, synthetic Atlas/core/Gemini/deletion and Google OAuth-initiation checks passed after updating. Production frontend59files had zero configured-secret matches; local source/export170files had zero known-secret matches. Earlier3b003bb release/image retained. HTTP->HTTPS and HTTPSwww->root redirects and Gobbler favicon200 verified.

No Google personal connection is yet present. Owner clarified they needed directions; site sign-in page was opened. All synthetic accounts deleted. Real Google sync/write needs that separate personal consent. New Discord code is deployed but disabled/unconfigured.

## Earlier production checkpoint — 2026-09-19

This checkpoint supersedes older local/deployment-pending entries below; those are retained as history.

- **Live URL:** https://vtevents.us. Source revision `3b003bb`, on the existing Vultr VM behind Caddy HTTPS with Atlas M0 and replacement Gemini key.
- Latest complete suite **45/45 passed**. Backend/frontend typechecks, architecture rules and historical/current contract checks passed. Full Expo/backend production Docker build passed on the actual host. Linux env preflight and Compose configuration validation passed.
- All seven anonymous HTTPS smoke probes passed before and after an app restart. Secure, HttpOnly, SameSite=Lax session-cookie flags verified.
- Synthetic HTTPS flow passed signup, profile/interests/Friday availability persistence, 1,520 live events, saving, ICS export, real Gemini response with stored IDs, retired-demo 404 and account deletion. No personal calendar or Discord content was used.
- Production browser flow passed sign-in, onboarding, live search, Isidore String Quartet details/location/organizer/source, save, calendar destination review and ICS download feedback. Availability initially fit Friday 17:00–22:00; adding an overlapping September 25 busy block correctly changed the saved event to **Schedule conflict**. Other events showed **Availability unknown**.
- Desktop landing inspected at 1280×800; mobile event/calendar flow at 390×844, document width 390. Gobbler favicon link and My Gobbler page title verified. Settings correctly shows Google/Canvas unavailable and Discord collection disabled.
- App container restart preserved the synthetic account session, onboarded profile and saved event in Atlas. Startup refresh completed again: 2,242 GobblerConnect and 349 VT Sports records (counts include historical events).
- Runtime is non-root with read-only filesystem, dropped capabilities, rotated logs and internal-only Node port. App log inspection showed only normal startup. Production frontend bundle scanned against configured secrets: 59 files, zero matches.
- Google configuration follow-up: Calendar API enabled, sole owner test user saved, two scopes declared and exact production callback configured. Env preflight and HTTPS smoke passed after app recreation. Synthetic OAuth-initiation test verified configured status, redirect, PKCE/state and scope set; account deleted. The owner must consent from their own application account before live sync/write testing.
- Disposable browser account deletion correctly required a fresh login after five minutes; reauthentication and deletion passed. New Gemini still answered successfully after the old key was deleted.
- Not claimed: whole-host reboot, long-term scheduled execution, real Google/Canvas writes, Discord installation/canonical publication, Databricks live dashboard, or audible browser playback. Email verification/password recovery and Vultr hard spending protection remain unresolved.


## Verified locally on 2026-09-19

- TypeScript checks for backend and frontend. Latest suite: **22/22 tests passed**.
- Expo web export and backend production compilation.
- Automated tests: unknown availability, exact free coverage, conflicts, touching endpoints, DST, partial coverage, event normalization, cancellations, deduplication/provenance, unsafe source URLs, ICS escaping and stable UID, recommendation grounding, missing-Gemini fallback, authenticated encryption and calendar-write key scope.
- API tests against isolated real MongoDB: separate users/profiles/private context/saves, unauthenticated rejection, origin/CSRF rejection, demo/live separation, invalid OAuth state, unavailable Google config, expired Google sync state, ICS response, grounded demo assistant, account deletion. Mocked Google writes verify repeated calls produce one provider write. Source replacement removes absent persisted records. Gemini success, unknown-ID rejection, API failure and daily limits are mocked; they are not real Gemini service verification. Analytics erasure and future enqueue suppression are verified with mocked Databricks SQL responses.
- Additional checks cover provenance and canonical ID stability, duplicate splits, false substring categories, nonexistent/repeated DST wall times and multi-day all-day ICS end dates.
- Official GobblerConnect feed: 2,219 validated records at direct check. Official VT Sports schedule metadata: 349 records. These counts include past events; public discovery filters old records.
- Browser desktop landing inspected at 1280px. Demo save visibly changed to Saved. Details showed time/location/source. Calendar review showed destination and event; ICS click produced download confirmation.
- Mobile discovery inspected at 390x844, document width 390px: no horizontal overflow. Original mascot and responsive navigation rendered.
- Resumed browser verification: disposable local account sign-in → interests + Friday recurring availability → live search → Isidore String Quartet details → save → calendar review → ICS click feedback. Live ICS endpoint independently returned HTTP 200 with `text/calendar` and a valid VCALENDAR. Added a busy block and verified the saved event changed from free to conflict. Gobbler's Friday-after-five results contained stored events and the conflict note. Current browser rendered at 512px despite requested 390px override; measured no horizontal overflow at 512px. Earlier 390px/1280px checks remain separate evidence.
- Local database now reuses its persisted port. A stop/start cycle succeeded with existing data, and both real source adapters refreshed again (2,219 GobblerConnect / 349 Sports, 1,503 currently discoverable records at this check).
- Fresh `npm ci --include=dev` and full audit returned **0 vulnerabilities** after lockfile override resolution. Production-dependency audit also returned zero.

## Historical remaining-work checkpoint (superseded by current status)

- Public Node/HTTPS deployment, real OAuth calendar writes, Discord server installation, ElevenLabs live audio, and Databricks ingestion/dashboard remain unverified. Atlas M0 and real Gemini calls are verified locally against their cloud services.
- Sites preview is not published. The existing project returns NOT_FOUND to the currently connected Sites account; recover that account/project access instead of creating a duplicate.
- Keyboard/200% zoom accessibility, final production mobile/desktop rendering and expired-provider UI need expanded deployed browser checks.
- Better Auth tests warn that no client IP is available under Supertest. Verify trusted proxy/IP configuration for the actual deployed host.
- Production account verification/password recovery is not configured; decide and implement appropriate maintained-auth recovery before broad public launch.

## Two-minute demo

1. Open the landing page and create a disposable demonstration account. The current v2 app requires sign-in; anonymous sample mode was retired.
2. Select interests and add recurring free/busy blocks. Continue to discovery.
3. Search/filter live listings. Open an event and explain its fit/unknown/conflict note and source provenance.
4. Save it; open **Saved** and **Schedule** to see the same record.
5. Choose **Add to calendar**, review the event and destination, and download ICS.
6. Opt in to Gemini and ask Gobbler a day/time or interest question. Recommendations reference stored live event IDs; a provider failure uses the deterministic fallback.
7. Show Settings and distinguish configured providers from blocked connections. Do not use the owner's personal calendar or private Discord content in the demonstration.
8. Delete the disposable account through Settings after the walkthrough.

## Live cloud verification checkpoint

- Real Atlas M0 ping, schema indexes and source persistence passed. Synthetic account HTTP flow on localhost3001: signup, preferences, Friday recurring availability, live discovery, save/read, ICS, real Gemini recommendations with stored IDs, demo/live separation and account deletion all passed.
- Latest source counts:2,219 GobblerConnect/349Sports;1,502 current or ongoing events. Counts change with time.
- Narration tests exercise strict public event IDs, authentication, missing configuration, provider payload grounding, cache reuse, hard character limit and failed-request reservation without automatic retries. These are mock-provider checks, not a live ElevenLabs claim.
- Production build generated the Gobbler favicon; browser verified its link. Current landing inspected at1280x720 and390x844; document width equals390 at mobile size.
- The earlier Docker-engine blocker is resolved; see the Vultr preparation checkpoint below. Hosting still waits for cost-safe Vultr approval.

## Latest voice and Discord verification

- ElevenLabs Free10,000credit plan confirmed in dashboard. Created a TTS-only key with8,000credits per refresh period and leak auto-disable. Real provider narration produced270,881bytes of MP3; repeat used cached identical bytes. Authenticated HTTP narration endpoint passed; disposable QA account deleted. Final browser playback inspection remains.
- Latest suite:23/23 tests passed. New Discord tests cover current-owner-only configuration, cross-server rejection, private/non-announcement channel rejection, non-member rejection, ownership transfer, permission revocation and empty-selection removal. These use mocked Discord provider responses; no real server has been installed/configured yet.
- Production build and frontend/backend typechecks passed after owner configuration UI/API changes. Follow-up targeted Discord test passed after explicit current-owner identity check.

## Final browser checkpoint

The local Atlas-backed UI completed signup, saved interests, live discovery, grounded Friday-after-five recommendations and ElevenLabs generation. It displayed “Your audio is ready” and the native audio player. Clicking Play crashed the Codex in-app browser tab; the cause is not yet established, so audible playback is NOT claimed verified. The app recovered in a fresh tab, and its disposable browser QA account was deleted through Settings. A standard browser playback check is still required.

Source checkpoint ace873f was pushed to JARA-org/vtevents/main; local and remote SHAs matched. Known credential values were absent from all 56 tracked/untracked source candidates and the built frontend (99 files total). Secrets remain ignored.


## Vultr preparation checkpoint (2026-09-19)

- Architecture and historical v1/current v2 compatibility checks passed; frontend/backend typechecks passed. Full suite: **33/33 tests passed**, including configuration validation and deployment probe failure behavior.
- Production Docker image built successfully with the pinned Node 22 base and production-only backend dependencies. Expo export and backend compilation passed inside the build.
- Compose configuration validated with Compose v5.5.1; Caddy configuration validated with the selected `caddy:2-alpine` image. Production env files use raw mode (requires Compose 2.30+), preserving literal secret characters.
- Runtime container used an isolated local MongoDB 8 instance, no cloud credentials, read-only filesystem, dropped capabilities, no-new-privileges and the 768 MB memory limit. All seven probes passed over internal HTTP: landing HTML, configured health, v2 bootstrap, anonymous account/events/recommendation rejection and retired demo listing rejection. This does not claim public HTTPS, real Atlas connectivity, or authenticated browser verification.
- The image health command passed with initialized database/accounts. It now rejects missing account/database configuration, although existing health flags do not perform a live database ping.
- No Vultr resources were provisioned and no public deployment was performed. Free-compute approval, hostname/DNS, production credential setup/rotation, Atlas allowlisting and deployed TLS/browser checks remain outstanding.

## Latest checkout and domain checkpoint — 2026-09-19

- Pulled upstream main f6a4cfd with the v2 authentication-only frontend, type-only shared contracts and read-only Discord bot/collector. Preserved the demo retirement and server-controlled domain decisions.
- Architecture/contract checks and frontend/backend typechecks passed. All 43 existing tests passed; the new Discord production configuration regression passed with all four deployment tests. Production Expo export/backend build passed.
- Fresh real Atlas/Gemini HTTP verification passed: synthetic signup, profile/availability persistence, 1,520 live discoverable events, save/read, ICS, Gemini recommendations referencing stored IDs, retired demo rejection and deletion of the disposable account. Source health reported 2,242 GobblerConnect and 349 Sports records. Counts include historical records and change over time.
- Corrected the production Discord credential group to CLIENT_ID + PUBLIC_KEY + BOT_TOKEN, rejecting retired CLIENT_SECRET and invalid collection/AI flag/budget combinations. Collection/extraction remain disabled until installed and configured.
- Saved Porkbun root A 45.77.222.255 and www CNAME vtevents.us, TTL 600. Independent DNS resolution through 1.1.1.1 verified both changes. This does not verify HTTPS deployment.
- Existing Vultr VM was found in the owner console; no new VM was created. Server access and Atlas allowlist entries are prepared, awaiting browser-required confirmations. Its hard spending cap remains unverified. Docker Desktop's engine is unavailable on this Windows checkout; the prior container validation above was performed elsewhere.

Follow-up verification: the complete 44-test suite passed. Browser inspection found stale one-hour-cached landing HTML from the retired frontend; HTML now revalidates while static assets retain their existing cache duration. A build-independent HTTP fixture verifies this header. Updated API/deployment tests (5/5), architecture/contracts/typechecks and production build passed after that fix. Current landing was visually inspected at390x844 and1280x800 with no horizontal overflow; Gobbler branding/favicon remain present. No production HTTPS claim.
# Calendar and readiness hardening (2026-09-19, not yet deployed)

Regression tests use isolated Mongo replica sets and synthetic provider responses.
They verify malformed/missing availability does not erase prior busy data, valid
empty availability succeeds, disconnect wins over in-flight calendar sync and
OAuth exchange, other users remain connected, missing refreshed access tokens fail
closed, and stale refresh failures cannot expire replacement credentials. Public
health tests verify live database probes, no-store, redacted outage response and
HTTP503. Production live-provider sync/write still needs owner consent.


## Local v3 retirement verification — September 20, 2026

Architecture checks, all three contract floors, backend/frontend typechecks and
production build pass. The full suite passes 120 of 121 tests on this macOS host;
`deploy-release.test.ts` fails because bundled Bash lacks `mapfile`, before testing
the release behavior. The release script and test were not modified. Updated v3
smoke/preflight tests pass separately.

Isolated MongoDB API checks cover authenticated 410 responses for every retired
provider route (including callbacks and repeated writes), no provider calls or new
OAuth/write records, private-data isolation, and old imported busy blocks excluded
from discovery. Manual availability and ICS tests still pass. Browser review against
a disposable local database confirms interests-only setup, no connection panel,
and friendly source labels with Coming soon in place of a simulated raw error.
No deployment, production data change or external credential revocation was run.
