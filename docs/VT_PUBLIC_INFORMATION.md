# Virginia Tech event and deadline source roadmap

Research date: September 19, 2026 (America/New_York). Scope narrowed to events and deadlines at the user's request.

## Scope

Collect Virginia Tech events people can attend or participate in, and deadlines by which they must take an action. Events include club meetings, games, competitions, performances, exhibitions, workshops, lectures, conferences, career fairs, information sessions and organized volunteer/social activities. Deadlines include registration, academic add/drop or withdrawal, applications, scholarships, housing applications and payments when an authoritative source specifies an applicable due date.

Events require a title/description, an identifiable date and a physical or online location under existing qualification rules. Physical and online attendance may coexist. Natural-language dates may be inferred from trusted source posting context; an explicit written day/month/year is not required. Unknown times remain TBD and ambiguous dates remain unpublished.

Deadlines are distinct: require an action/title, due date, authoritative source and applicable audience or term when specified. They do not require a venue. Preserve date-only precision rather than inventing an exact cutoff time. Do not force deadlines through event validation or change the meaning of existing event fields.

Ordinary menus, opening hours, transit, maps, service directories, course catalogs, news articles and research documents are outside this roadmap. A scheduled dining activity is an event; a menu is not. A research presentation is an event; a paper is not. A dated article is not automatically an event or deadline. Academic breaks and term boundaries alone do not qualify unless they describe a qualifying activity or action cutoff.

This is a source audit and proposed integration plan, not a complete crawl or a claim that every connector works in production. No new connectors were deployed during the research. Retained sources were inspected during the original audit; this scope edit does not constitute a fresh availability check.

## Source inventory

**Feed documented** means the provider advertises a machine-readable interface. **Page verified** means public content/navigation was inspected, not that a supported API was confirmed. **Limited** means retrieval was blocked or incomplete. Priorities are proposed integration order.

| Source | Events/deadlines to collect | Evidence and next step | Priority |
|---|---|---|---|
| [GobblerConnect calendar](https://gobblerconnect.vt.edu/ics_helper?TB_context=Subscribe_To_Calendars&TB_iframe=true&embed=1&height=550&modal=true&mode=set&width=850) | Public club events; explicit event registration deadlines where supplied | Feed documented; existing ICS adapter. Retest payload, stable UIDs and cancellations | P0 |
| Configured Discord channels and explicit submissions | Qualifying club announcements and flyers | Existing event integration; preserve opt-outs, club ownership, revisions and server budgets. Deadline extraction is proposed, not implemented by this document | P0 events |
| [University events](https://events.vt.edu/) and [sitemap](https://events.vt.edu/sitemap.html) | Lectures, conferences, exhibitions, outreach and other scheduled activities | Page verified; inspect structured event metadata before bounded detail-page parsing | P0 |
| [Athletics](https://hokiesports.com/all-sports-schedule) | Games, meets and competitions | Page verified with dynamic-content limitations; validate existing per-sport JSON-LD adapter | P0 |
| [Registrar academic calendar](https://www.registrar.vt.edu/dates-deadlines/academic-calendar.html) and [Registrar](https://www.registrar.vt.edu/) | Academic action deadlines, including registration and graduation applications | Page verified; parse dated entries by term and audience, excluding dates without an event/action | P0 |
| [Libraries](https://lib.vt.edu/) | Workshops, talks and other library calendar events | Page verified with event links; investigate event exports only | P1 |
| [Center for the Arts](https://artscenter.vt.edu/) | Performances and dated exhibitions | Page verified; structured metadata first, then bounded detail-page parsing | P1 |
| [Recreational Sports](https://recsports.vt.edu/) | Scheduled activities, tournaments, trips and their registration deadlines | Page verified; audit event details and public participation eligibility | P1 |
| [Career and Professional Development](https://career.vt.edu/) | Career fairs, workshops, information sessions and explicit application/registration cutoffs | Public events observed; deadline coverage needs detail-page audit; general job listings excluded | P1 |
| [Dining Services](https://dining.vt.edu/) | Explicitly scheduled dining activities and special events | Page verified with event navigation; exclude menus, hours and meal-plan descriptions | P1 |
| [Housing](https://housing.vt.edu/) | Application/selection deadlines and scheduled housing events | Page verified; extract explicit dated actions only, excluding individual placements and account data | P1 |
| [Financial Aid](https://finaid.vt.edu/) | Scholarship and financial-aid application deadlines | Page verified; audit exact due dates, academic year and applicable audience; exclude individual awards | P1 |
| [Bursar](https://www.bursar.vt.edu/) | Publicly specified payment/action deadlines | Page verified; audit dated details; exclude personal bills and balances | P1 |
| [Cranwell International Center](https://international.vt.edu/) | Scheduled community programs and explicit program registration deadlines | Public site inspected; qualifying listings/feed require further audit | P2 investigation |
| [Research](https://research.vt.edu/), [undergraduate research](https://undergraduate.research.vt.edu/), [Graduate School](https://graduate.vt.edu/) | Seminars, symposia, presentations and explicit application/submission deadlines | Retrieval limited; verify public listings before designing adapters | P2 investigation |

GobblerConnect's subscription page distinguishes public school-wide feeds from authenticated personal/group feeds. Never import a personalized export containing restricted records into the public collection. The direct ICS download could not be retested through the research browser, so production health remains unverified.

The athletics research view contained loading placeholders. The repository parses JSON-LD from individual schedules; this audit did not establish complete current coverage. Live-score collection is outside this roadmap.

Discord is configured public input, not an official university authority or permission to harvest arbitrary servers. Source availability does not establish that every page or record qualifies for ingestion.

## Qualification and reconciliation

Classify each record as an event, a deadline or neither before publication. Preserve source evidence for the activity/action and its date. A publication timestamp is not automatically an event date or due date. Reject unsupported or ambiguous interpretations.

Keep provider identity as `(sourceId, nativeRecordId)` with per-field provenance. Match shared upstream IDs and explicit cross-source links first. Title/time/place/organizer similarity can propose matches but must not silently merge incompatible facts. A club's name cannot establish ownership. Preserve authorized owner corrections under existing policy.

For events, retain recurrence instances, date ranges, cancellations, postponements, campus, audience, admission requirements and registration links when provided. A public listing does not guarantee attendance is free or open to everyone. Keep event detail/registration links separate from online attendance links.

For deadlines, retain the action, due-date precision, timezone if known, academic year/term, applicable audience and submission link. Do not assume that the same deadline applies to undergraduates, graduates, incoming students and all programs. Keep the deadline to register for an event distinct from its start date. An extended deadline needs a source revision, not a duplicate reminder. Conflicting cutoffs remain explicit until an authoritative revision resolves them.

A partial fetch must never replace a complete snapshot or remove unrelated records. Preserve the last good snapshot with freshness status on failures. Confirm deletions, cancellations and exclusions through the source and existing publication policy.

## Backend design (proposed additions only)

Existing event contracts and fields remain intact. Define a separate additive deadline contract before implementing deadline ingestion. Do not represent a due date as an event start time or fabricate a venue to satisfy event validation.

| Resource | Data to preserve | Backend responsibility |
|---|---|---|
| Existing event DTO | Activity, date/time precision, venue/online attendance, organizer, audience, source evidence and revision | Validate, reconcile and return event projections |
| Proposed deadline DTO | Action/title, due date, optional exact cutoff/timezone, date precision, audience/term, submission URL, source evidence and revision; optional related event ID | Validate due dates, reconcile revisions and return deadline projections |
| Supporting source/evidence records | Provider identity, allowed origins, native record ID, fetched/source-updated times, hash, completeness, visibility and health | Bounded refresh, provenance validation, idempotency and withdrawals |

This document does not implement deadline DTOs or HTTP endpoints. All future interfaces belong in the shared type-only contract file, with backend implementations and compatibility checks. UI only calls typed backend interfaces and renders returned event/deadline data.

Use ordinary parsing for ICS, JSON-LD, structured APIs and known date tables. AI may interpret announcements, flyers or ambiguous relationships. Authorization, date arithmetic, ownership, filtering and freshness remain deterministic. Retrieved text is untrusted and cannot grant permission or change model capabilities.

Queries read authoritative projections without silently refreshing sources or spending model budget. Refresh commands use durable bounded jobs, idempotent revisions and per-source concurrency limits. Source/evidence records support event/deadline ingestion; they do not introduce standalone directory, mapping or information-search products.

## Freshness and cost

Suggested starting targets, subject to provider permission and rate limits:

| Content | Proposed refresh | Failure behavior |
|---|---|---|
| Public event feeds | Every 15–30 minutes; less often for slowly changing pages | Preserve last good data, expose stale status and retain cancellation/revision evidence |
| Public deadline pages | Daily; more often near a cutoff if supported | Show applicable term and last successful check; never silently invent a replacement cutoff |
| Discord announcements | Existing Gateway post/edit/delete triggers and explicit submissions | Preserve durable work, exclusions, revision deduplication and per-server AI budgets |

Refresh is shared per source, not repeated for each user. Conditional requests and content hashes avoid unnecessary parsing/model calls. Do not reintroduce Discord channel-history scans. Ordinary event/deadline filtering requires no AI.

## Implementation sequence

1. **Verify existing event sources.** Check GobblerConnect, Discord and athletics coverage, stable IDs, cancellation handling, timezones, recurrence and partial-refresh behavior.
2. **Add university events and academic deadlines.** Build bounded source adapters and a separate additive deadline contract. Test classification of event/deadline/neither, date precision and audience/term distinctions.
3. **Expand specialist coverage.** Add arts, libraries, career and recreation calendars, followed by qualifying dining/department activities and housing, scholarship and payment deadlines.
4. **Improve reconciliation and answers.** Provide source-backed event/deadline results, preserve conflicting evidence and avoid title-only merges. Manual conflict-resolution tooling remains subject to the existing deferred product plan.

Acceptance criteria: evidence-backed dates, correct record type, stable identities, accurate revisions/cancellations, no private-data leakage, no mass deletion after partial failures, explicit freshness and contract compatibility. Track source coverage, stale records, parsing failures and unresolved duplicate/conflict rates.

## Remaining investigations

- Retest the public GobblerConnect ICS payload and redirect without authentication; compare coverage to public listings.
- Verify structured event metadata for every athletics sport.
- Identify public event exports for libraries, arts, career, recreation and dining. Undocumented JavaScript endpoints are not automatically supported APIs.
- Audit Registrar, housing, financial-aid and Bursar detail pages for current, audience-specific deadlines.
- Audit departmental seminars, research presentations and application/submission deadlines absent from central calendars.
- Evaluate alumni, Extension, satellite-campus and community calendars only for VT-relevant events/deadlines; these were not exhaustively audited.
- Confirm source terms and collection limits before enabling adapters. No permission requests or other messages were sent during the research.

ANS identity verification does not prove a date is correct or grant publication rights. Personal provider integrations have been retired; public ingestion cannot read historical private context.

## Implementation status (supersedes roadmap-only descriptions above)

The source families above are now registered for periodic, bounded, conditional checks. The backend implements separate deadline DTOs/API/UI, rich event metadata, sports parsing, source reconciliation and initial public website memory. Known structured/HTML layouts are parsed deterministically without new model calls. See Master.md for the exact implemented behavior and docs/VT_SOURCE_ENDPOINTS.md for verified formats and remaining source limitations. Registration is not a guarantee of complete usable content: inaccessible sources and ambiguous years remain explicitly unavailable/unpublished. Discovery continues across bounded passes; unchanged detail records are not reprocessed, rewritten or sent to AI. The initial read and subsequent conditional index/detail requests remain necessary where providers offer no change feed.
