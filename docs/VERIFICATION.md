# Verification and hackathon walkthrough

## Verified locally on 2026-09-19

- TypeScript checks for backend and frontend. Latest suite: **21/21 tests passed**.
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

- No production Node backend, Atlas cluster, Gemini call, real OAuth calendar write, Discord bot installation, or Databricks ingestion/dashboard has been verified.
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
