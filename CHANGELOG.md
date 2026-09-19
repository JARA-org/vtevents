# Change log

## 2026-09-19 — My Gobbler visual refresh

- Rebranded the app, browser title, account copy, download filenames and manifest
  to **My Gobbler**. Kept existing database, infrastructure and calendar UID
  identifiers so existing data and calendar subscriptions remain compatible.
- Used Arthur's supplied turkey icon and full mascot throughout the header,
  landing page, sign-in, footer, favicon and social preview. No generated art.
- Added the warm cream, VT maroon, burgundy and gold theme; locally served Nunito
  with its OFL license; rounded cards and reusable raised buttons with press,
  loading, disabled, keyboard-focus and reduced-motion behavior.
- Redesigned the landing page and controlled sign-in/create-account card;
  refreshed discovery, filters, saved plans, schedule and settings presentation.
- Replaced action-error banners with a reusable modal. Added readable network,
  sign-in and server messages, explicit keyboard cycling, Escape/backdrop close
  and return focus. Success confirmations and source-health status stay inline.
- Preserved existing typed frontend/backend boundaries and authentication.
  Password reset and social sign-in are not configured in this build, so the UI
  does not advertise nonfunctional controls.
- Added public `?page=landing` and `?page=auth` views for direct preview links.
- Added a regression test for error transport copy and retained all existing tests.

### Asset details

Source artwork was supplied as PNG. PNG exports retain those pixels; `logo.svg`
and `favicon.svg` contain the original raster art in SVG containers, not vector
tracings. For resolution-independent editing, supply original vector artwork.
The interface itself uses flat colors; shading present in the provided art is
preserved. Social image and favicon files are in `apps/frontend/public/`.

### Verification

- Architecture, v1/v2 contracts, TypeScript and production build passed.
- All 31 tests passed, including the new transport-error regression check.
- After merging the team's subsequent Discord/deployment source updates,
  the combined build, typecheck, architecture/contracts and all 45 tests passed.
- Lighthouse accessibility: **100/100** for Home and Sign-in (mobile audit,
  2026-09-19); reports are in ignored `work/lighthouse-*.json`.
- Browser checks: desktop and 390px layouts, live authenticated discovery,
  error modal, Tab/Shift+Tab focus containment, Escape and focus return.
- Runtime health confirms the local database/accounts and both public feeds.
- This refresh changes the source build; production deployment is unchanged.
