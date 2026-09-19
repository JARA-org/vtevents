# Discord bot: collection and qualification

Discord is a server-installed bot, not a linked app-user account. This milestone
implements reading selections, individual message submissions, exclusions, a bounded
collector, and optional AI interpretation with deterministic qualification. It does
**not** yet publish the staged candidates into the canonical campus event feed.

## Commands

- `/gobbler watch public:true`: select the current text/announcement channel for automatic reading as
  public campus input. The explicit flag acknowledges publication outside Discord.
- `/gobbler unwatch`: stop automatic reading of the current channel; explicit submissions remain independent.
- Message context menu → Apps → **Ignore for Gobbler**: persist an exclusion for
  that message. Requires Manage Server or Administrator permission.
- `[no-ai]` anywhere in message text, case-insensitive: exclusion checked before
  persistence for AI/extraction or any model call by the eligibility interface.

Message context menu → Apps → **Submit to Gobbler (public)** designates only that message, even in an unwatched channel the bot can view/read. Manage Server/Administrator permission is required. The command stores only its reference; it does not enable the channel. Exclusions override submissions. Either reading path, both, or neither can be used.

The bot never alters Discord settings, permissions, roles, or messages. Watch/unwatch only change our database selection. Only selected channels or explicitly submitted messages qualify. Granting the bot general server access
does not opt in every channel. Text channels are supported as well as Discord's
dedicated announcement channels. All command replies are private/ephemeral and
disable mentions. The bot cannot write to Canvas or calendars.

## Setup (not performed automatically)

1. Use a Discord application with **Guild Install**, `bot` and
   `applications.commands` scopes. Grant View Channel and Read Message History;
   do not grant Administrator. Restrict the bot to the intended channels.
2. Set backend `DISCORD_CLIENT_ID`, `DISCORD_PUBLIC_KEY` (the application's public
   verification key), and `DISCORD_BOT_TOKEN`. No Discord client secret or
   app-user OAuth redirect is required. Never put the token in frontend settings.
3. Host the backend on HTTPS. Set the application's Interactions Endpoint URL to
   `https://YOUR_ORIGIN/api/discord/interactions`. Signed PING requests are handled.
   This HTTP-based bot does not require a persistent Gateway connection for these
   commands; it may appear offline in the member list.
4. Preview commands with `npx tsx scripts/register-discord-commands.ts`. To register
   them, run the same command with `--apply`. Optional `DISCORD_TEST_GUILD_ID`
   limits registration to a development server. Registration upserts these named
   commands, without bulk-deleting unrelated application commands.
5. Install the bot in a test server, invoke the commands, and verify private
   responses. No live installation or registration is claimed by local tests.

MongoDB must support transactions (Atlas or the local replica-set runner).
Commands store policy and an interaction receipt in one transaction. Replaying
an earlier enable cannot override a later disable. Database operations have a
bounded deadline to leave room for Discord's initial response deadline. Live
HTTPS latency still needs verification; collection/model work must never run
inline in the command handler.

## Boundaries and migration

`discord-bot-http.ts` verifies Ed25519 signatures over timestamp + exact raw bytes
before parsing. It rejects invalid/stale signatures. `discord-bot.ts` validates
payloads, application identity, server context, permissions, explicit publication
consent and message/channel identity. `discord-bot-store.ts` alone owns policy,
exclusions, and replay receipts through the shared `DiscordBotRepository` port.
These modules cannot import private connectors or model clients under the checked
dependency graph.

Old Discord OAuth code and its UI are removed. Old channel-management endpoints
return 410; generic connection routes accept Google/Canvas only. Historical
contract declarations remain for compatibility/reference, not as active features.
Old Discord private snapshots and credentials are not read by the bot, jobs, or
private-context responses and are never converted into public input. They remain
subject to account deletion; deployment operators should separately retire/revoke
old credentials rather than silently copy them into the new collections.

## Collection and extraction

Backend environment settings (restart the backend after changing them):

```dotenv
DISCORD_COLLECTION_ENABLED=true
DISCORD_AI_ENABLED=true
DISCORD_AI_DAILY_LIMIT=20
GEMINI_API_KEY=your_backend_key
```

Collection and AI are independently disabled by default. With collection enabled
but AI disabled or unavailable, eligible message text is stored as `pending`, not
as an event. Model calls reserve a separate atomic daily budget first (maximum
100 configured calls/day); unchanged qualified/rejected text is not interpreted
again. Model failures stay pending. The configured limit bounds calls, not dollar
cost; apply provider-side limits too. Tests use fake readers/models, never paid calls.

The server polls every two minutes, with one leased collector across processes.
Each bounded run handles up to ten watched-channel pages (100 messages/page), plus
up to twenty manual references and twenty previously collected records. Long
histories are paged across runs with persistent checkpoints; initial scanning
includes existing readable history. New messages arriving during catch-up are
picked up on the next scan. This is eventual polling, not real-time delivery.
Message deletions/edits are rechecked fairly over successive polls. ID-only references (without excluded text) allow later removal of a [no-ai] marker to be observed. Repeating /gobbler watch also restarts the channel scan; unchanged content remains cached. Permission loss
removes affected records when observed. A message created and deleted between
polls may never be seen. Attachments, OCR, embeds, and nested reply history are not
interpreted in this milestone; collection reads plain message text only.

Enable Message Content Intent in the Discord application when required for bot
REST access to content. Empty or inaccessible content never becomes a qualified
event. Bot access is GET-only; no channel settings, permissions or messages change.
429 responses suspend reads for the provider's retry interval.

`discord_collected_messages` holds source references, text revision fingerprints,
status (`pending`, `rejected`, `qualified`) and a validated candidate or null.
This collection is not exposed through public event APIs. `[no-ai]`/explicit
exclusions prevent text storage and model submission. Ignore and unwatch purge
withdrawn staged records; explicit individual submissions remain independent.
A transactional policy fence prevents stale work from resurrecting withdrawn
consent. Withdrawal cannot retract content already sent in an in-flight model call.

Qualification requires an explicit valid day/month/year, source-backed descriptive
text, and a physical or online venue. ISO `2026-09-25`, `September 25, 2026`, and
`25 September 2026` are supported; ambiguous numeric dates are rejected. The model
may interpret venue meaning but must return exact evidence quotes. The backend
checks evidence, valid dates, and HTTP(S) attendance links. Missing time is not
fabricated: staged candidates carry a date, not a made-up timestamp.

`onlineUrl` is separate from physical `location`; `isOnline` can describe online
attendance with a forthcoming link. Hybrid events carry both. Existing canonical
events retain their required fields. The next milestone is safe publication and
cross-source consolidation of qualified candidates, including removal of derived
contributions without deleting independent source evidence.

Official protocol references:

- [Receiving and responding to interactions](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Application commands](https://docs.discord.com/developers/interactions/application-commands)

## Collection inspection and AI limits

Use `/gobbler recent` in a channel to privately inspect up to five collected message previews, their extraction status, and links to the originals. Use `/gobbler status` to inspect the channel selection, enabled flags, server ID, and current budgets. Both require Manage Server plus channel read access for the caller and bot. Register the updated commands and restart the backend after upgrading. There is no web message viewer yet. Qualified candidates remain staged, not published events.

Collection polls every two minutes while the backend runs; no message-triggered cloud function or Gateway listener is deployed. New messages and edits are processed when discovered, and older tracked messages are rechecked in bounded batches. This is eventual detection, not immediate delivery. Polling, hashing, permission checks, and rate limits require no AI; only text interpretation uses the model.

Default maximum extraction attempts: 20 globally per UTC day (`DISCORD_AI_DAILY_LIMIT`), 5 per server per UTC day (`DISCORD_AI_GUILD_DAILY_LIMIT`), 2 per server per UTC hour (`DISCORD_AI_GUILD_HOURLY_LIMIT`), and 2 per message per UTC day (`DISCORD_AI_MESSAGE_DAILY_LIMIT`). Limits are atomic persistent database reservations using Discord guild/channel/message IDs; renaming a server does not reset them. Failed calls still count. The same content fingerprint gets at most one attempt per UTC day, with completed revisions cached beyond that. These are request caps, not dollar budgets.

Each run permits at most five AI calls. New/edited messages settle for 90 seconds and input is limited to 6,000 characters. Budget-blocked or oversized messages remain pending. Daily/hourly windows reset at UTC boundaries. AI remains opt-in through `DISCORD_AI_ENABLED=true` and a configured provider key. Viewing status or recent messages never calls AI.

## Updated server-only policy

The previous app/day, message/day and five-calls/run limits above are superseded. Only server hourly and daily spending caps apply (defaults 2 and 5), shared by posts and edits. `DISCORD_AI_DAILY_LIMIT` and `DISCORD_AI_MESSAGE_DAILY_LIMIT` no longer configure the active worker. Failed attempts count; each content fingerprint is attempted once across quota resets. There are still input-size, settling-time and worker-duration bounds; those are processing safeguards, not app-wide spending quotas. Work waiting for budget may be processed in a later window, but attempted unchanged text is never automatically retried.

Watch activation starts with subsequent posts and does not backfill channel history. To select an older message, use its Apps menu → `Submit to Gobbler (public)`. Edits to selected messages are detected by the existing poll. This release does not deploy a real-time Discord Gateway listener or cloud function. Club-level Discord/GobblerConnect ownership links and conflict-review workflows are specified in Master.md but not implemented yet.

## Club setup and sign-in

Discord ingestion now requires a server linked to an owned website club workspace. Run `/gobbler setup` as a server administrator (Manage Server). An unlinked server's other commands also offer setup; Ignore and Unwatch continue to work without a link. Open the private ten-minute link, sign in/create a website account, then create a new club or select one you already own. Submitting that form automatically connects the server. One server links to one club; a club links to one server. No personal Discord OAuth is used, and no Discord channel settings are modified.

The link is a bearer authorization from the Discord administrator: do not share it. Only its hash is stored, and the token travels in the URL fragment until posted to the authenticated backend. It expires after ten minutes and cannot be redeemed by another account after use. A failed link leaves no partially created club. All access and binding checks run on the backend. Club events are matched by stable club ID, never by organizer name; staged Discord proposals are shown separately from published events.

Visit `/clubs` or use the site's Clubs link. Website accounts belong to representatives rather than shared club passwords. The dashboard is read-only for events; claiming imported club identities, event CRUD and manual conflict resolution are future work. Existing watched servers stop collection until linked; setup does not automatically watch any additional channels.

Deployment: build/restart the backend and register the updated commands. `APP_ORIGIN` must be the reachable website origin used for sign-in. The development tunnel that exposes only `/api/discord/interactions` cannot serve the club page; use the local website on the same computer or deploy the website for remote club representatives. This implementation does not expand the restricted tunnel or enable paid services.

## Automatic publication and corrections

Qualified Discord messages now publish directly to website discovery and the club event list; no approval action is required. Pending and rejected messages stay unpublished. Existing qualified records become eligible without rerunning the model. The club page offers Edit event after publication, with ownership checks, stale-edit protection and an audit history. Corrections survive Discord re-extraction, but withdrawal of the source removes public visibility. Date-only events show Time TBD and remain listed through the local event date. This replaces the earlier staged-only behavior described above. Collection and AI still require their enabled settings and provider credentials; this change does not enable paid AI services automatically.

## Live post/edit processing

The two-minute collection poll is replaced in production by a Discord Gateway listener. New posts and text edits in eligible channels enqueue their exact message IDs; submissions from the message menu enqueue immediately. Rapid edits settle for three seconds. Only local pending jobs are checked by the queue timer; channel history is not scanned. Embed-only updates (such as a YouTube preview arriving) do not trigger extraction. Deletion events withdraw events and prevent in-flight work from recreating them.

Enable DISCORD_COLLECTION_ENABLED and DISCORD_AI_ENABLED and supply GEMINI_API_KEY locally. Enable Message Content Intent on the app's Bot page in Discord Developer Portal. `/gobbler status` reports listener connection state; disconnected/error requires checking the running backend and bot intent/token. The worker records pending messages without an AI key, and retains work while waiting for budgets. Server caps still apply. No unsolicited Discord messages or reactions are sent.

Restart the backend after code/environment changes. The listener needs a continuously running backend and outbound network access; it does not require a public inbound endpoint for message notifications. Slash/message commands still use the signed interactions endpoint. Accepted queued work survives restarts; messages posted while the backend was entirely offline may need explicit resubmission. This change does not relax the full-date requirement: use a day/month/year rather than just today.

## Relative dates now supported

The full-date requirement above is superseded. Today/tomorrow and reasonably resolvable weekday or partial-date references can qualify. The model receives the original Discord posting timestamp and campus timezone, not the time the worker runs. Edited messages retain their original date anchor. Ambiguous announcements remain unpublished. Re-submit an earlier rejected announcement to process it under the updated rules; the normal server budget still applies. Event time remains Time TBD until time extraction is implemented.

## Current worker behavior (supersedes earlier polling and budget descriptions)

Gateway message creation/edits and explicit submissions queue eligible messages. Three backend worker lanes process distinct messages concurrently; leases and message locks serialize each message. Defaults: 20 AI attempts per server per UTC day and 5 per UTC hour, including edits and failures. Configure DISCORD_AI_GUILD_DAILY_LIMIT and DISCORD_AI_GUILD_HOURLY_LIMIT, then restart. No app-wide or per-message spending caps apply. Atomic quota reservations and revision deduplication remain enforced across workers.

## Append messages and read flyers

Use `/gobbler append announcement:<original message link> message:<additional message link>` in the channel containing both messages. Obtain each link using Discord's Copy Message Link action. Both messages become explicitly selected public input. Append to any member to extend the same group, up to eight messages. Requires Manage Server and channel read permissions. The bot never edits Discord messages. If a member is missing, deleted or opted out, the combined announcement is withheld.

Attach PNG, JPEG or WebP flyers directly to an eligible message. Image-only messages are supported. Up to three images (4 MiB each) are interpreted with the announcement text in one server-budgeted AI request. Embedded previews, arbitrary image URLs and QR-code links are not fetched. Text extracted from images is model interpretation and can be mistaken; owners can correct published event fields.

Deployment: deploy the changed backend, configure its Discord credentials/flags, restart/recreate its app process, and register commands with `npx tsx scripts/register-discord-commands.ts --apply`. Local `.env` changes do not configure the hosted server. `npm run local` must be restarted after environment changes. A Compose env-file change requires recreating the app container, not merely restarting it. Discord's Interactions Endpoint URL must point at the configured backend's `/api/discord/interactions` route; an unsigned test POST should return 401, not 503. Never expose credentials in chat or logs.
