# Integration status and exact access requirements

| Integration     | Status in this workspace                                                                                                  | Remaining dependency                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GobblerConnect  | **Live and tested:** 2,242 validated records on 2026-09-19                                                                | None for public feed; some locations intentionally require source sign-in                                                |
| VT Sports       | **Live and tested:** 349 structured records across official sport schedules on 2026-09-19                                 | None for public metadata; unannounced starts and missing ends remain unknown                                             |
| Better Auth     | **Live HTTPS tested:** accounts, preferences, saves, deletion and restart persistence                                | Email verification/recovery                                                                     |
| MongoDB Atlas   | **Live and tested:** M0 cluster `my-little-gobbler`, narrow user/database permissions and workstation/server `/32` entries               | None for production connectivity; retain narrow network entries                                                                |
| Gemini          | **Live and tested:** `gemini-3.5-flash-lite`, real grounded responses from stored event IDs                               | Production replacement key tested; old exposed setup key deleted                                                                 |
| Discord         | Read-only signed commands, Gateway-triggered durable queue, server budgets, club linking and automatic qualified-event publication implemented; disabled in production | Endpoint is online; bot token/public key, message-content intent, server installation and command registration remain pending |
| ElevenLabs      | **Live and tested:** Free plan, TTS-only key capped8,000credits/refresh; realMP3, cache and authenticated endpoint passed | Secret deployed; final audible browser playback QA                                                                             |
| Vultr           | **Live and tested:** https://vtevents.us on existing VM `45.77.222.255`, Docker/Caddy, source revision `55e3420` | Hard spending cap still unverified; no additional paid resources. Exposed Vultr API key requires rotation |
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

## Discord

The current design is a read-only server-installed bot, with no app-user account
linking. Signed commands select channels for automatic reading,
submit individual messages independently, and exclude messages. No Discord
channel settings or permissions are changed. The latest team implementation uses Gateway-triggered durable work, per-server AI budgets, verified server-to-club linking and automatic publication of qualified events with audited owner corrections. Live bot configuration and server installation remain pending. See [bot setup and boundaries](DISCORD_BOT.md).

## Official references checked

- https://www.mlh.com/events/vthacks-14/prizes (Vultr, Tiger Data and ElevenLabs are listed; Render is not)
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- https://docs.vultr.com/platform/billing/manage-account-limits

- https://docs.expo.dev/guides/publishing-websites/
- https://better-auth.com/docs/adapters/mongo
- https://better-auth.com/docs/integrations/express
- https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/structured-output
- https://docs.discord.com/developers/resources/channel
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec


## Account email delivery (2026-09-20)

Password recovery and email verification use Better Auth one-hour tokens. Open
`/recover` for recovery or `/recover?verify=1` to resend verification. Successful
password reset revokes all existing sessions. Unknown accounts receive the same
reset response. Existing accounts are not locked out by this rollout.

Set backend-only `RESEND_API_KEY` and `AUTH_EMAIL_FROM` together, after verifying a
sending domain in Resend. Use the free plan; do not enable paid overages. The
MongoDB `account_email_outbox` encrypts recipients and links, deduplicates links,
leases deliveries, retries up to five times, and expires records after one hour.
Provider idempotency keys protect ambiguous retries. Account deletion removes
queued messages. The worker runs every ten seconds inside the existing backend.
`GET /api/account-email` reports configuration availability, not inbox delivery.

The adapter and authentication lifecycle are tested. Actual sending is NOT yet
verified: free Resend signup terms approval, domain DNS verification and a sending
key remain pending. No messages are sent while configuration is absent.

## Discord production checkpoint (2026-09-20)

Only Discord fields from the supplied env were applied; production auth,
encryption and analytics secrets were preserved. Gateway state is connected.
Application MyGobbler now uses `https://vtevents.us/api/discord/interactions`;
Discord accepted endpoint validation. Guild commands were registered in Gobbler
Test. Message Content intent is enabled. No teammate Discord code was changed.

No public announcement channels are selected. Each server owner must run
`/gobbler setup`, finish club linking, and select channels with `/gobbler watch`
using its public-channel confirmation. Full event publication testing awaits an
owner-selected channel and test announcement. Do not select private channels or
post on an owner's behalf without explicit instructions.
