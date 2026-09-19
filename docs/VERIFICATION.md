# Verification and hackathon walkthrough

## Verified locally on 2026-09-19

- TypeScript checks for backend and frontend.
- Expo web export and backend production compilation.
- Automated tests: unknown availability, exact free coverage, conflicts, touching endpoints, DST, partial coverage, event normalization, cancellations, deduplication/provenance, unsafe source URLs, ICS escaping and stable UID, recommendation grounding, missing-Gemini fallback, authenticated encryption and calendar-write key scope.
- API tests against isolated real MongoDB: separate users/profiles/private context, unauthenticated rejection, origin/CSRF rejection, demo/live separation, invalid OAuth state, unavailable Google config, ICS response, grounded demo assistant, account deletion. Additional mocked Google write test verifies repeated calls produce one provider write.
- Official GobblerConnect feed: 2,219 validated records at direct check. Official VT Sports schedule metadata: 349 records. These counts include past events; public discovery filters old records.
- Browser desktop landing inspected at 1280px. Demo save visibly changed to Saved. Details showed time/location/source. Calendar review showed destination and event; ICS click produced download confirmation.
- Mobile discovery inspected at 390x844, document width 390px: no horizontal overflow. Original mascot and responsive navigation rendered.

## Not yet verified / remaining work

- No production Node backend, Atlas cluster, Gemini call, real OAuth calendar write, Discord bot installation, or Databricks ingestion/dashboard has been verified.
- Sites preview has been registered but is not published. Preview-mode changes were added after the first browser checks and require their own build and deployed verification.
- Full account onboarding in browser, latest live-source UI, keyboard/200% zoom accessibility and expired-provider UI need expanded browser checks.
- `npm audit` reports 13 moderate transitive findings in Expo tooling and query parsing. Overrides were added, but install/dedupe still reported findings; investigate lockfile resolution and verify compatible remediation. Do not force a downgrade to Expo 46.
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
