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
