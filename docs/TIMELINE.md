# Campus timeline

The signed-in For you page is the main discovery entry. It uses the same warm VT
maroon, burnt orange and cream family as the app, with a quieter header and compact
system typography. No external animation library, model or generated media is used.

## Interaction

- Entrance: a central dot appears, pauses, then extends into a seven-day line.
  The selector and prompt appear after the roughly two-second entrance. The
  entrance replays on every fresh page load, including reloads in the same tab.
  Reduced-motion preferences skip the entrance. Returning from event details or
  changing dates preserves the current interaction without replaying the entrance.
- Every campus day is an interval; Today, day 3 and day 7 are emphasized. Drag in
  either direction from any day. Release leaves a draft; Show my timeline commits
  the selection. Single days are supported. Keyboard users can select endpoints
  with Enter/Space or extend with Shift + arrows. Arrow keys and Home/End move focus.
- Confirmation retracts unselected parts, recenters/extends the chosen segment,
  then reveals event bubbles sequentially in chronological order. Day labels and
  unknown/all-day times preserve backend meaning. Spacing favors readability,
  not a proportional time scale.
- Desktop/landscape uses about five bubbles above and five below, within one screen
  at the verified sizes. Portrait has a vertical, draggable/native-scroll rail.
  Expanding a bubble scrolls its controls into view in portrait.
- Hover or keyboard focus reveals a small thumbnail, location, explanation and
  Save/Details/Calendar. Click/tap pins expansion; a second click/tap opens details.
  Horizontal top-row details open upward and bottom-row details open downward;
  short viewports scroll the details within the available space. Outside interaction
  or Escape dismisses expansion. Existing calendar confirmation
  and idempotency are unchanged; expanding never writes a calendar.
- Change dates sits beside the selected range in a bordered button and refreshes
  the current seven-day selector without the entrance.
  Discover more restores the original discovery grid with all upcoming events and
  its existing search/category/day filters. It does not inherit selected dates.
- Empty selected ranges show an honest empty state. Failed reads show unavailable
  with retry/navigation; the UI does not synthesize dates, matches or fallback data.
- The cinematic component targets the Expo website. Non-web native builds offer
  navigation to the existing discovery grid rather than rendering unsupported DOM.

## Backend contract

`POST /api/timeline` is an authenticated, origin-checked, read-only query.
`{}` returns seven ISO local dates in America/New_York and an empty selection.
`{startDate, endDate}` selects an inclusive range wholly within that current week.
Both fields must be supplied together, in order; unknown fields and invalid/stale
ranges fail with 400. The route accepts no user identity, profile or score. It
reads the caller's profile, feedback, saves and scoped private busy context through
existing interfaces. No refresh, provider mutation, model spend or persistence is
triggered by the query. It is retryable and has no write transaction.

Selection operates on the current authorized catalog, rechecking Discord publication
eligibility on reads. Already-started timed events, cancelled events and events
starting outside the range are excluded; same-day all-day/date-only events remain
eligible without invented times. Historical multi-month records are not promoted
into today's timeline. Up to ten slots are distributed with first-day weight 2 and
remaining-day weight 1, largest remainders first, with chronological round-robin
redistribution when a day lacks candidates (e.g. 4/2/2/2 for four full days).

Within each day's allocation, explicit category-interest overlap takes priority.
Ties favor less represented categories, organizers and source families across the
selected set, then existing recommendation score and start time. Without expressed
interests this yields a diverse set including academic/career categories when
available. Popularity and "major event" significance are not fabricated from titles.
Returned items retain authoritative availability/reason and matched-interest tags;
the client only renders them. Existing event/recommendation DTO meanings and the
legacy discovery endpoint are unchanged. The grid's existing 60-result cap remains.

## Validation

`tests/timeline.test.ts` covers DST, bounded/reversed/stale ranges, arbitrary and
single-day selections, chronological output, quotas, sparse-day redistribution,
interest priority, diversity, cancellations, unknown times and input immutability.
The API test covers authentication, CSRF, identity injection and caller isolation.
Browser verification uses the running local backend and real catalog, not UI fixtures.
