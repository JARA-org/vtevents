# Master Prompt:

&nbsp;

We are developing a personalized Virginia Tech student sidekick app. Our app’s main focus is to&nbsp;

assist students in finding events around the Virginia Tech campus based on initial questions and canvas availability.

# Features:

&nbsp;Can add events to Canvas through API

# Implementation Details:

Mobile app coded in React Native Expo&nbsp;

Backend coded in Node.js

Database in MongoDB Atlas

Different components should act as black boxes to each other:

Database offers functions for storing, retrieving data, etc. \-\> callers do not know how they are implemented

Agents return general form of data \-\> receivers do not know how data is retrieved

&nbsp;

Databricks for data analytics, recommendations for events based on individual user data and past events

## Interfaces:

Agents should output a common data shape. Agents have different ways of getting data, but they return information in the same way to make things easier for the consolidation agent and make development of the agents easier. The general data format should take this shape (still prone to changes depending on what data we want to work with):

{

&nbsp;“type”: “event” | “context”

&nbsp;“data”: string

&nbsp;…

}

Multiple agents:

4 Data Fetching Agents:

* GobblerConnect  
* Canvas  
* VT Sports  
* Discord  
* Google Calendar&nbsp;

&nbsp;1 Coordinating Agent:

* Consolidate information  
* Remove duplicate events

&nbsp;1 User-Facing Agent:

* Give response to users&nbsp;

&nbsp;

All agents should function through the Gemini API.

&nbsp;

GobblerConnect agent:

&nbsp;Access public API

&nbsp;

Canvas agent:

&nbsp;Access student’s canvas through access token.

&nbsp;Access Calendar events, announcements, classes.

&nbsp;Add events to calendar

&nbsp;Canvas API: [Calendar Events | Instructure Developer Documentation Portal](https://developerdocs.instructure.com/services/canvas/resources/calendar_events)&nbsp;

&nbsp;

VT Sports Agent:

&nbsp;Access sports events via hokiesports API

&nbsp;[https://hokiesports.com/sports/football/schedule](https://hokiesports.com/sports/football/schedule)&nbsp;

&nbsp;

Discord Agent:

&nbsp;Pipeline:

1. Add discord bot to club discord  
2. Select channels for announcements  
3. Pass text from channels to agent  
4. Process information then return through coordinating agent

&nbsp;

Google Calendar:

&nbsp;Process Events

&nbsp;Add Events

&nbsp;

&nbsp;

# Improvements:

Could be a UI improvement when adding busy/free times during first setup. Adding dates just appends text to the bottom which looks very ugly.

&nbsp;

We should create a banner that shows live events when looking at the sports category.

Sports entries seem bare right now, VT sports API should provide sufficient information:

* I see on hokie sports there is a link for a live stream, maybe we could embed this somehow?  
* Opponent, Sport type, Date, Time, etc.  
* Time might be inaccurate right now, I don’t see a time for Virginia Tech v Chowderfest but on My Gobbler it says it ends at 11:59 EST
* Currently sport type is missing, which could lead users into thinking every sports event is football  
* We also could pull up relevant news articles through a news API  
* Some sport entries have TBD start/ending dates. We could ping periodically to fix that, or just put a disclaimer saying we might not have accurate dates.  
* We could also pull up past records in a certain sport vs another university.

Data does appear to be broadly accurate to sources, but entries don’t show much to the user. Our app should be a one-stop shop for all VT events, so we should try to put as much information as we can on one event. For example, instead of only showing the event in isolation, we can also show: past events, a summary of typical club activities, (potentially include social media posts?)

&nbsp;

Adding to the calendar should not require start and end times like it currently does. It should suggest a general shape of calendar events, based on the current information. For example, if we only have the ending time, then only supply the end time of the event. Users should be able to modify this event if they want, so they aren’t locked into a certain event if the details are wrong.

&nbsp;

Instead of eliminating duplicate entries between sources, merge them together for more information. Because discord might have more information on the event than gobblerconnect.

&nbsp;

We could do a periodic site wide evaluation of all the club groups through AI. This would mean asking AI to find any information about clubs like past events, purpose, members, etc. This might be really expensive so this would have to be run infrequently.&nbsp;

User-facing agent should be more personalized and informative. A user’s agent should have memory of the user and their previous chats. The agent should have a site-wide memory of VT events like stated above. The user-facing agent does not speak to the user currently. It currently only has the purpose of filtering events. The agent should speak to the user and respond to queries, while also providing potential suggested events.

&nbsp;

I like the schedule conflict notification, but there could be improvements in UI and information.

&nbsp;

Prompt for black box implementation:

No back-end code should be present in front-end code, this is a hard stop rule. Front-end code should only call back-end interfaces, and act on data specified in the return of the interface. Front-end code should only influence front end UI, back-end code should be in functions which front-end code calls for a side effect or a data shape. I want you, from our specifications, to create a comprehensive list of backend functions and data types. The more we have defined, the easier it will be in the future, so define as much as possible. Make sure the side effects and returns of functions show clearly what the function does. Make sure data types can be extended, but the old fields still remain there, so if we decide to add more data the frontend code does not break. I want you to define all of these interfaces within a file in a shared folder between backend and frontend. Additionally, backend itself should try to enforce this methodology as much as possible, but instead of backend to frontend it is scoped to specific backend functionality. I want you to describe and enforce this methodology to all future chats by adding an [agent.md](http://agent.md) file while clearly describes what I have said.&nbsp;

&nbsp;

# Roles:

Redley \- Discord bot:

* Manual fields through tagging  
* Scoped to specific channels  
* Maybe additional commands  
* Other agents  
* Canvas API  
* Google Calendar API

John \- Backend:

* MongoDB Atlas, implement database functions from defined interfaces  
* Web hosting/cloud functions on vultr  
  * Setup progress: Docker/Caddy package, production preflight and read-only smoke checks are implemented; see [deployment runbook](deploy/README.md). Image build and isolated MongoDB container checks pass. Live at https://vtevents.us on the existing Vultr VM; public core flow and restart persistence passed. Hard spending protection remains unverified; see NEXT_AGENT_PROMPT.md.
* Maybe work on agents?  
* Databricks analytics for user preferences

Arthur \- UI/UX:

* Develop a general theme from inspirations  
* Color scheme  
* Define constraints and goals  
* Make our logo  
* First revamp landing page and login (add some flair make look less ai)  
* Pop up errors/better looking errors

Ansh \- Quality Testing

* UI feel and consistency  
* Run unit/integration tests on all backend code  
* Make sure backend and frontend work together  
* Verification that something fulfills the purpose it was set out to do  
* Put your agent on ultra mega conspiracy mode and test everything

# Ansh please test:

* All contracts between frontend and backend  
  * Do they both return and expect the same data?  
  * Is the data itself correct for our use case?  
  * Are we covering all the contracts?  
  * Is all code following our methodology of a black box between backend and frontend?  
* &nbsp;

# 9/19/2026:

4 agents with 4 different data sources: google calendar, canvas, gobbler connect, discord

Each one knows how to handle their specific platform but returns a common data shape.

One agent which acts as a consolidator between all of the agents which merges the data from all sources. One agent which acts as a user-facing assistant that has memory of the user and past events.&nbsp;

The data source agents (not google calendar or canvas because those are through personal access tokens) \+ consolidator run for the whole site on a recurrent schedule for base information about events. MongoDB holds data on all clubs: past events, members, (history of public interest maybe?). Agents match clubs \+ events with past club \+ events and concatenate to the memory. Canvas \+ google calendar \+ chat history are concatenated to user-specific memory.&nbsp;

Data from canvas and google calendar are always encrypted on the server. All events will be public.

## Discord collection controls (September 19, 2026)

Collection uses a deterministic two-minute backend poll, not an AI invocation on every Discord notification. Only settled, eligible, changed text reaches extraction. Use Discord guild ID as the stable server quota identity, with transactional global/day, guild/day, guild/hour, message/day and revision/day caps. Defaults are 20/5/2/2 attempts respectively, maximum five calls per run, 90-second settling time, and 6,000 input characters. Failed attempts count; exhaustion fails closed and leaves work pending. Administrative private `/gobbler recent` and `/gobbler status` commands inspect current-channel collection and usage without AI. Channel settings remain untouched. Qualified candidates remain staged until a separate publication pipeline exists.

## Revised Discord policy: server budgets and future club ownership

This supersedes the previous global/message/day limits. The active Discord worker has no app-wide or per-message spending cap and no five-call app-wide run cap. Posts, edited text, and explicit message submissions share the guild's hourly/daily budget (defaults 2/hour and 5/day). The trusted Discord guild ID is the quota key. Each content fingerprint is attempted at most once, including failed attempts; resetting a quota window does not itself retrigger AI. Work not yet attempted may wait for server budget. Polling is transport only, never a reason to invoke AI for unchanged text. Watch activation excludes earlier channel history; explicit message submission can select an older message. The existing message menu is named `Submit to Gobbler (public)`; this is the requested Gobbler message-connect action, not a link to GobblerConnect.

Future requirement (not yet implemented): clubs must link their Discord server to a verified club record on the website before public ingestion. Clubs may also link their GobblerConnect organization. Require authorization on both sides; matching names alone does not prove ownership. These are club-level source links, not personal Discord account linking. Keep a stable internal club ID independent of server or organization renames.

Proposed reconciliation (not yet implemented): assign a stable internal event ID and retain mappings to each provider's event/message IDs. An explicit reference to a GobblerConnect event or a club-confirmed link establishes identity. Otherwise, compare within the verified club using date/time, venue/online URL, description and title; title alone never establishes identity. Similarity only proposes a match, particularly for recurring meetings, changed dates or multiple events in one message. Ambiguous matches require club review and stay separate until confirmed. A canonical event can have multiple field-level claims with source, source update time and evidence. Owner-confirmed corrections take precedence; newer fetch time does not establish truth. Conflicting dates, times, locations or cancellation claims must remain visible for owner resolution rather than silently selecting the newest feed. Preserve physical and online locations independently and retain audit history. Model interpretation can propose matches/corrections but cannot commit ownership, authorize calendar writes, or overwrite disputed facts.

## Deferred: claiming club identities and managing events

Do not implement claiming existing club identities yet. A club whose events already appear publicly without an account, or a club that wants to publish directly, will later be able to claim its website identity after ownership verification. Authorized club representatives will then be able to create, modify and delete their own events and manually resolve conflicting fields. Keep source evidence and an audit trail; account creation or matching a club name must never automatically claim existing imported events. Remind the user about this backlog item when returning to club-management work.

Current implementation scope: representatives sign in using website accounts, create a new club workspace, and access only that club's associated events. A private setup link issued to a Discord server administrator leads to sign-in and club creation/selection and securely binds that server to the club. This is server-to-club linking, not personal Discord OAuth. Discord collection requires the server link. Existing imported club identity claiming, event CRUD, and conflict resolution remain deferred per the latest request.

Club setup delivery is now implemented: `/clubs` uses existing website account authentication and exposes owned club workspaces, published events already associated by club ID, and qualified Discord proposals. `/gobbler setup` issues a private ten-minute server-link ticket; club creation or selection consumes it atomically. Collection and new watch/submission commands require a linked server with an existing account owner. Explicit opt-outs still work before setup. This does not implement verification/claiming of an existing imported identity or event edits/conflict resolution. A site origin reachable by the representative is required; the restricted Discord interactions tunnel does not serve the website.

One-club rule: each website account can create only one club workspace. Backend transactions serialize creation per account and reject a second club even under simultaneous requests with different request IDs. Retrying the original successful request remains idempotent. The website displays creation only when the backend returns `canCreate=true`. Existing records are preserved; pre-existing duplicates are not silently deleted. Collected event proposals are qualified, unpublished Discord extractions awaiting the future review/publication workflow.

## Discord automatically publishes events (latest policy)

Qualified Discord extractions automatically appear in website discovery and the owning club's event list. There is no approval or proposal-publication step. Persisted qualified source records form the publication source of truth; a backend projection rechecks evidence, linked club ownership and current watch/submission/exclusion policy on reads. Stable event IDs derive from guild/channel/message identity. Other provider snapshot refreshes cannot erase Discord events. Date-only extraction publishes with an explicit time-TBD flag, not an invented confirmed time; the event remains visible through its campus-local date.

Club owners may edit already-published Discord events on the club page: title, description, date, physical location, online URL and online-attendance flag. Backend checks ownership and optimistic revision, stores an audited correction, and preserves corrections across source refreshes. Physical and online venues coexist. Edits change the website only, never Discord or personal calendars. Deleted, opted-out, unselected, inaccessible or no-longer-qualified source messages cease publication when detected. AI execution remains opt-in and subject to server limits; pending/invalid messages never publish.

This supersedes all earlier descriptions of staged proposals requiring approval and the deferral of corrections to already-published Discord events. Claiming imported identities, manual creation/deletion tools and cross-source conflict resolution remain deferred. No pure title-based cross-source merging is added.

## Live Discord message triggers (supersedes scheduled collection)

Production now listens to Discord Gateway message create/update/delete/bulk-delete events. The SDK maintains heartbeats and reconnect/resume. Only eligible watched-channel or explicitly submitted message IDs enter a durable database queue; message bodies, embeds and attachments are not stored by the Gateway adapter. Rapid edits coalesce over three seconds. A local queue pump processes due IDs through the existing collector; it never scans channel history. Explicit message submissions create queue work atomically with the selection/receipt. Queue leases survive process failure and completion of an older job cannot discard a newer edit. Deletion installs a withdrawal fence so late extraction cannot republish the deleted message.

The AI only interprets eligible text after backend checks; duplicate content remains cached, server budgets remain enforced, and rate-limited/unavailable work waits. Jobs already accepted into the queue survive restarts. Gateway notifications emitted while the app is fully stopped may not be recoverable; explicitly resubmit such a message. No automatic historical backfill is introduced. A persistent backend process is required; this is not a per-message serverless deployment.

Runtime prerequisites: DISCORD_COLLECTION_ENABLED=true, DISCORD_AI_ENABLED=true, a configured GEMINI_API_KEY and Discord Message Content Intent. Collection without AI credentials records pending messages. `/gobbler status` now includes listener health and clearly identifies missing AI configuration. The strict full-date qualification rule still applies: today/tomorrow without a day, month and year do not qualify. Changing this rule requires a separate product decision.

## Relative event dates (latest policy)

A written day/month/year is no longer required. The model interprets today, tonight, tomorrow, weekdays and omitted years using the original Discord message timestamp in America/New_York. Processing time and edit time must never replace that anchor. Date evidence quotes the original temporal expression and inferred dates include a brief reasoning explanation. The backend checks calendar validity, evidence, trusted timestamp/timezone, obvious relative-day arithmetic and simple weekday consistency. Ambiguous or absent date references remain unpublished. Text is untrusted and cannot instruct the model to replace its trusted posting context.

The extraction fingerprint now includes the original posting timestamp, campus timezone and policy version. Older rejected text can be re-evaluated after an edit or explicit submission without bypassing server budgets. Publication revalidation uses the same posting context. Date interpretation changes do not invent a confirmed event start/end time; time extraction remains separate.

## Concurrent Discord workers (latest policy)

The live Gateway create/edit triggers and explicit submissions feed three concurrent backend worker lanes per process. Exact-message collection locks and durable queue leases serialize edits to the same message while unrelated messages run concurrently. Existing atomic database quota reservations, content revision deduplication, opt-outs and deletion fences remain enforced. Defaults are now 20 AI attempts per server per UTC day and 5 per UTC hour, shared by posts and edits; there is no app-wide spending cap. Worker concurrency is a capacity limit, not a quota. Restart the backend after changing runtime settings. No cloud functions or history backfill are introduced.

## Explicit announcement append and attached flyers (latest policy)

`/gobbler append announcement:<original message link> message:<additional message link>` links existing messages from the command's channel as public input. Signed Manage Server permission and channel read permissions are required. No Discord messages/settings are modified. Links resolve to a stable root, so appending to a previously appended message extends the same announcement. Maximum eight messages per group; cycles, joining two existing groups, cross-channel links and exclusions are rejected. Membership and command receipts persist in MongoDB. Each member retains its original timestamp; date evidence selects the corresponding source message. Edits invalidate grouped output and queue the root. Missing, deleted or opted-out members withhold the whole announcement rather than publishing an incomplete combination. This is explicit grouping, not AI-based automatic relatedness matching.

Attached PNG/JPEG/WebP flyers can supply event text, including image-only messages. The worker reads only Discord CDN attachments returned by the provider, never arbitrary links or embeds. At most three images per announcement, each at most 4 MiB; downloads have time/byte/type limits, no redirects and no credentials. One budgeted model request transcribes the images and extracts the event with attachment/message provenance. Transcriptions are model-derived evidence, not independently verified OCR. Unreadable/ambiguous output remains unpublished; image instructions cannot authorize actions. Binary image data is transient, not persisted. The 20/day and 5/hour server limits remain shared with ordinary text extraction. No website image gallery is added.

## ANS agent verification (implementation and deployment boundary)

ANS (Agent Name Service) establishes which registered remote agent is calling our backend. It does not establish that an event is true, that model output is safe, or that an agent may access a user's account. Identity verification, permission checks, and content validation are separate deterministic backend responsibilities; none require AI.

The backend now includes an incoming-caller verifier for the ANS-6 badge tier with mutual TLS (Method A). Operator configuration pins each role to an ANS name, host, version and registration ID, plus explicitly trusted transparency-log HTTPS origins. The verifier checks certificate validity, exact DNS/URI identity, fresh DNS badge discovery, registration status and the registered certificate fingerprint. Missing, mismatched, revoked, expired or unavailable evidence rejects the handoff. ACTIVE, WARNING and DEPRECATED statuses are accepted under this profile and returned to the caller; warnings are not silently converted into ACTIVE. There is no stale-success fallback. Network reads are bounded and redirects are rejected.

`receiveAnsHandoff` reads the actual authenticated TLS peer certificate before invoking a backend operation. Request bodies, model claims and forwarded certificate headers cannot establish identity. TLS must terminate at that boundary with a trusted client CA; ordinary HTTPS terminated by the existing reverse proxy is insufficient. The operation still owns payload validation, user authorization, revision/idempotency checks and transactions.

Our agents currently run as modules inside one backend. Local handoffs now enforce explicit role/scope policy at public source ingestion, Discord publication, assistant input and private-context access: GobblerConnect/sports/Discord may provide public events to the coordinator; the coordinator may provide public recommendations to the assistant; Canvas/Google Calendar context may reach the assistant only for the same authenticated user. Public ingestion cannot receive private context. Agent handoffs never authorize Canvas/calendar writes; explicit user approval remains mandatory in the existing integration path.

**Deployment status:** this is a tested verification library and TLS boundary, not a live ANS deployment. No registrations, certificates, DNS entries, remote agent endpoints or mTLS listener have been provisioned; no existing local module call is claimed to be cryptographically ANS-authenticated. Remote services must use the boundary before processing data. Outgoing callee verification, DPoP, SCITT receipts/status tokens, certificate lifecycle automation and signed Trust Index credential verification remain unimplemented. The Trust Index payload parser is explicitly unverified diagnostics and never grants authority based on scores. See [ANS implementation notes](docs/ANS.md).

## Virginia Tech event and deadline roadmap (latest scope)

The public-source expansion is limited to events and deadlines. Events are dated activities people can attend or participate in, with a title/description and physical or online location under existing qualification rules. Deadlines specify an action and due date, with applicable audience/term when supplied; they do not require a venue and must use a separate additive contract rather than reinterpret event fields. The [event and deadline research inventory](docs/VT_PUBLIC_INFORMATION.md) covers relevant sources and implementation priorities. Standalone menus, opening hours, transit, maps, service directories, course catalogs, news and research documents are excluded. Those pages may supply evidence for a qualifying event or deadline, but are not separate ingestion products. This supersedes the earlier broad public-information roadmap; existing private integrations and ANS policies remain intact. Prefer structured feeds and ordinary parsing; use AI only for interpretation of unstructured content with provenance and validation. The roadmap does not claim its proposed connectors or deadline interfaces are implemented.

## Periodic public events/deadlines and richer HokieSports (implemented)

The shared scheduler now checks all source families in docs/VT_PUBLIC_INFORMATION.md through the operator-owned registry in public-source-registry.ts. It wakes each minute but only processes due sources: event sources default to 30 minutes, deadline sources to daily. Discord keeps its existing Gateway triggers and per-server budgets. Source pages use persistent ETag/Last-Modified checkpoints and content hashes. Unchanged bodies skip parsing; semantically unchanged records preserve their revisions and are not rewritten into canonical events or memory. Known details are conditionally rechecked even when an index is unchanged, because providers do not universally offer an updated-since feed. Initial discovery and indexes necessarily require reads; this is not a promise of zero requests for unchanged websites.

Collection is bounded and incremental. Each pass discovers/revisits a limited number of pages, retains its checkpoint in MongoDB and resumes later. Missing/failed/unrecognized pages preserve prior data; explicit detail 404/410 marks its contributions cancelled/withdrawn. An unavailable or ambiguous source is reported, never filled with invented events. Coverage is partial until a supported provider interface establishes completeness. Graduate/undergraduate research access and some financial-aid years remain source limitations. Departmental GobblerConnect calendars preserve upstream identifiers for consolidation.

HokieSports now combines public structured event metadata with matching rendered schedule rows, retaining stable provider IDs, sport, opponent, home/away/neutral venue, supplied scores/state, watch/ticket/stats/recap links, real supplied image URLs and time precision. No end time or image is invented. Website events retain supplied images/alt text, address, organizer links, admission, registration and audience metadata within explicit bounded contracts. Media remains a source reference, not an automatically downloaded or embedded video. The frontend renders backend-returned fields only.

Consolidation now matches source identity and corroborating event evidence, not title alone. It combines complementary fields and preserves alternatives as field conflicts. Source fetch recency does not decide truth. Ambiguous matches stay separate. Club-owner corrections and their event IDs survive source reconciliation. Web and Discord events share this deterministic consolidation step. These functions do not require a model; no new AI extraction agents are invoked for structured or known-layout pages. No remote agent exchange is introduced. If remote model agents are added, the existing ANS boundary and independent scope authorization remain prerequisites; local module policy is not presented as cryptographic ANS verification.

Deadlines have a separate additive CampusDeadline contract, authenticated GET /api/deadlines, and UI display. Venue is not required. Date-only deadlines remain date-only; source years, terms and audiences are preserved rather than inferred from the fetch clock. Existing event fields are unchanged.

## Site-wide public memory (initial implementation)

Successful public website ingestion records consolidated event/deadline revisions and current heads in MongoDB. Repeated unchanged content causes no history/head/organizer writes. Omitted past events remain historical, while explicit cancellation/withdrawal remains visible. Transactions are bounded in batches. Public organizer histories derive only from names, URLs and activities supplied by event records; they are explicitly unverified and do not claim club identity, infer membership or invent a club mission. Stored fields are allowlisted.

Authenticated public-memory search and assistant responses can return matching event history, deadlines and organizer records with source links. This initial retrieval is literal search, not semantic memory or private chat memory. Public website memory excludes Canvas, personal calendars, credentials and private conversation data. Discord contributions are consolidated for current discovery but are not archived into this new website memory until their revocation lifecycle is wired to prevent retained copies after opt-out/deletion. See docs/PUBLIC_MEMORY.md. Club claiming and other deferred management tooling remain separate.

## ANS activation prerequisites and outgoing verification (latest)

The user wants ANS integrated but confirmed that no identities or certificates are registered yet. Incoming caller verification is now complemented by outgoing callee verification against the badge's serverCerts, independently of identityCerts. The outgoing same-socket gate rejects unverified peers before application bytes are sent. This is tested transport infrastructure; no live pipeline is yet ANS-authenticated. Activation requires a chosen registration operator, operator-pinned names/hosts/registration IDs/log origins, certificates and a remote transport wired at both ends. Do not invent registrations, silently replace the live collectors or use test fixtures in production. No SSH or deployment was performed.

Canvas is excluded from current product scope because institutional API access is unavailable. Its legacy code is not a supported new ANS deployment target. Initial public-agent rollout should leave Google Calendar private context local until remote receiving identity, authenticated user scope and end-to-end authorization are integrated. ANS does not verify provider page truth or replace content validation; structured source parsing remains ordinary code.
