# Primary domain migration

The owner requested `mygobbler.us` as the primary domain on September 20, 2026.
The existing old domain is `vtevents.us` (plural), not `vtevent.us`.
Both continue pointing to the existing VPS, `45.77.222.255`; no extra server or
domain purchase is needed.

`deploy/Caddyfile` serves the app on `mygobbler.us`. The old apex and both www
names redirect to the new HTTPS origin with path/query preservation. The sole
exception is `/api/discord/interactions` on the old apex: it continues proxying
to the signature-verified backend because Discord has that webhook registered.
Do not remove it until the Discord application endpoint has been changed and
verified. No browser session/API access is broadened by that exception.

Run the manual **Configure primary domain** GitHub workflow on main. It uses
the existing deployment secret and current production image, takes the shared
deployment lock, locates the active Compose and mounted Caddy configuration,
backs up env/proxy configuration on the VPS, validates Caddy, sets APP_ORIGIN,
recreates only the app, and reloads Caddy. Failure restores the prior settings.
Credentials, database, persistent TLS storage, and app version are retained.

Users must sign in again on the new hostname because browser cookies cannot
transfer across these independent domains. Existing accounts and saved data
remain in the same database. Newly generated recovery/setup links use APP_ORIGIN.
Calendar/OAuth connections are retired in current product scope.

Future releases and free-tier configuration workflows use `mygobbler.us`.
The optional scheduled refresh must use repository variable GOBBLER_URL set to
`https://mygobbler.us` before being enabled. Verify HTTPS, authenticated reads,
deep-link redirects, and legacy Discord signature rejection after migration.

The latest general application deployment was already blocked by an unrelated
club-guide command-documentation test before this migration. This config-only
workflow deliberately retains the verified running app instead of publishing
that unverified application revision.
