# Verification and hackathon walkthrough

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

## Not yet verified / remaining work

- Public Node/HTTPS deployment, real OAuth calendar writes, Discord server installation, ElevenLabs live audio, and Databricks ingestion/dashboard remain unverified. Atlas M0 and real Gemini calls are verified locally against their cloud services.
- Sites preview is not published. The existing project returns NOT_FOUND to the currently connected Sites account; recover that account/project access instead of creating a duplicate.
- Keyboard/200% zoom accessibility, final production mobile/desktop rendering and expired-provider UI need expanded deployed browser checks.
- Better Auth tests warn that no client IP is available under Supertest. Verify trusted proxy/IP configuration for the actual deployed host.
- Production account verification/password recovery is not configured; decide and implement appropriate maintained-auth recovery before broad public launch.

## Two-minute demo

1. Open the landing page and choose **Take Gobbler for a spin**. Point out the explicit demo banner.
2. Open **Fine-tune your interests**, select interests, and add recurring free/busy blocks. Continue to discovery.
3. Search/filter listings. Open a sample event and explain its fit/unknown/conflict note.
4. Save it; open **Saved** and **Schedule** to see the same record.
5. Choose **Add to calendar**, review the event and destination, and download ICS.
6. Ask Gobbler a day/time or interest question. Demo responses use only sample records.
7. Switch to live events to show official source provenance. On static preview these are explicitly dated public snapshots, not live sync.
8. Show Settings: real services remain unavailable until configured. Do not imply the owner’s personal accounts are part of the demo.

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
