# Integration status and exact access requirements

| Integration     | Status in this workspace                                                                                                  | Remaining dependency                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GobblerConnect  | **Live and tested:** 2,219 validated records on 2026-09-19                                                                | None for public feed; some locations intentionally require source sign-in                                                |
| VT Sports       | **Live and tested:** 349 structured records across official sport schedules on 2026-09-19                                 | None for public metadata; unannounced starts and missing ends remain unknown                                             |
| Better Auth     | **Live Atlas tested:** synthetic account creation, profile persistence, saves and deletion                                | Public HTTPS deployment; email verification/recovery                                                                     |
| MongoDB Atlas   | **Live and tested:** M0 cluster `my-little-gobbler`, narrow user/database permissions and workstation `/32`               | Add selected host's outbound IP when hosting is available                                                                |
| Gemini          | **Live and tested:** `gemini-3.5-flash-lite`, real grounded responses from stored event IDs                               | Rotate setup key before public deployment; deploy secret                                                                 |
| Google Calendar | OAuth+PKCE, free/busy, write and revoke implemented; duplicate writes tested with mocked provider                         | Owner Google Cloud project, Calendar API enabled, consent screen, OAuth client, test-user consent                        |
| Canvas          | Scoped OAuth, paginated courses/calendar/announcements, refresh/revoke and guarded writes implemented                     | Virginia Tech must issue/enable an OAuth developer key with permitted scopes; user consent; write permission for writes  |
| Discord         | Read-only bot command foundation implemented; no app-user OAuth                                                           | HTTPS endpoint, bot installation, command registration, then collection/extraction                                       |
| Databricks      | Free Edition workspace exists; Node ingestion/outbox and dashboard SQL implemented                                        | Genie One MCP authentication/preview setup and live SQL/dashboard verification; console blocks automated control         |
| ElevenLabs      | **Live and tested:** Free plan, TTS-only key capped8,000credits/refresh; realMP3, cache and authenticated endpoint passed | Deployment secret; final browser playback QA                                                                             |
| Vultr           | API access and $100 MLH credit verified; Docker/Caddy package prepared                                                    | Owner requires $0 beyond credits with hard cap; no such cap found; free-compute application pending. No instance created |
| Tiger Data      | Feasibility researched; no resource or adapter claimed                                                                    | Optional public campus-activity metrics extension; verify sponsor free resources before provisioning                     |
| Render          | Free Node deployment Blueprint implemented, unused                                                                        | Owner explicitly chose to leave hosting pending for Vultr                                                                |
| Sites preview   | Separate static-preview deployment path                                                                                   | See resource inventory for final deployment status                                                                       |

Counts include past events. Discovery filters old listings. Neither adapter fabricates an undocumented campus API.

## GobblerConnect

The public Events page exposes this calendar subscription through `createCustomICSLink()`:
https://gobblerconnect.vt.edu/ical/virginiatech/ical_virginiatech.ics

It redirects to the observed CampusGroups CDN at `static-prod-us-east-1.campusgroups.com`; the adapter allows only that exact HTTPS redirect. Public robots rules were inspected; prohibited download/student-document/mobile endpoints are not used. Location text saying “Sign in to download the location” becomes unknown, not a fake location.

## VT Sports

The official all-sports page links to sport schedules such as https://hokiesports.com/sports/football/schedule. These contain public JSON-LD Event/SportsEvent metadata. The adapter follows official same-host schedule links with bounded concurrency, retains provenance, and validates each record. It does not call guessed internal APIs. Official robots.txt permits public crawling. Missing end times and TBD starts are surfaced honestly.

## Google Calendar

Dashboard: https://console.cloud.google.com/apis/credentials

Redirect: `https://YOUR_ORIGIN/api/connections/google/callback`

Scopes: `https://www.googleapis.com/auth/calendar.freebusy` and `https://www.googleapis.com/auth/calendar.events.owned`. Reads primary-calendar busy intervals for 60 days; creates only explicitly confirmed events in the primary calendar. Consent testing/verification requirements may limit who can connect; test-mode refresh tokens may expire. Reconnect states are handled in Settings.

## Canvas

Host is restricted to `https://canvas.vt.edu`; user-supplied arbitrary hosts are rejected. Redirect: `https://YOUR_ORIGIN/api/connections/canvas/callback`.

Developer key scopes: GET user profile, courses, calendar_events, announcements; optional POST calendar_events only when `CANVAS_WRITES_ENABLED=true`. Scope paths follow Canvas's official API scope format. University administrators must approve the key. Do not ask students to bypass university restrictions or paste private access tokens into the public demo.

Personal calendar writes use `user_<authenticated Canvas ID>`. The connected user’s real permission is enforced by Canvas. Reads paginate with a bounded maximum; an incomplete read fails rather than replacing existing context with a partial schedule.

## Discord

The current design is a read-only server-installed bot, with no app-user account
linking. Signed commands select channels for automatic reading,
submit individual messages independently, and exclude messages. No Discord
channel settings or permissions are changed. A bounded collector and optional budgeted AI extraction now stage validated candidates. Canonical event publication remains pending. See [bot setup and boundaries](DISCORD_BOT.md).

## Databricks

Use Free Edition only; do not start a paid workspace or trial requiring a payment method. Configure workspace URL, token, and warehouse ID. Run `npx tsx scripts/provision-analytics.ts`. It creates `workspace.default.gobbler_interactions` through the supported SQL Statement Execution API. `docs/analytics.sql` contains two useful dashboard queries (daily actions, event engagement). Create a dashboard with these datasets once workspace access is available. No deployed dashboard is claimed before that is done.

A Free Edition workspace has been created. Its console blocks automated browser control; the supported Genie One authentication path and exact blockers are recorded in GENIE_SETUP.md. The old `/learn/free` URL returns 404. Free Edition is intended for learning and personal prototypes; reassess its terms if this student project becomes commercial.

## Official references checked

- https://www.mlh.com/events/vthacks-14/prizes (Vultr, Tiger Data and ElevenLabs are listed; Render is not)
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- https://docs.databricks.com/aws/en/agents/mcp-tools/genie-mcp
- https://docs.databricks.com/aws/en/agents/mcp-tools/connect-clients
- https://docs.vultr.com/platform/billing/manage-account-limits

- https://docs.expo.dev/guides/publishing-websites/
- https://better-auth.com/docs/adapters/mongo
- https://better-auth.com/docs/integrations/express
- https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/structured-output
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth_endpoints
- https://docs.discord.com/developers/resources/channel
- https://docs.databricks.com/aws/en/dev-tools/sql-execution-tutorial
- https://docs.databricks.com/aws/en/getting-started/free-edition-limitations
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
