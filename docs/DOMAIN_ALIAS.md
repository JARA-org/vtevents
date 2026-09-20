# Additional domain: mygobbler.us

Configured September 20, 2026 under the user's existing Porkbun account.

- Root A: `mygobbler.us` -> `45.77.222.255`, TTL 600.
- WWW CNAME: `www.mygobbler.us` -> `mygobbler.us`, TTL 600.
- Both names redirect to `https://vtevents.us`, preserving paths and queries.
- A temporary redirect allows a future canonical-domain migration without cached permanent redirects.
- Authentication, Google OAuth callbacks, and application origin remain on vtevents.us.

The live Caddy container mounts `/opt/gobbler-releases/3fc68ee/deploy/Caddyfile`.
Its configuration was backed up as `Caddyfile.before-mygobbler`, validated, and reloaded without restarting the application.
Keep this repository's Caddyfile when deploying future releases so the alias survives.

Verification: Porkbun's authoritative DNS returns the root A record correctly;
public DNS still returned NXDOMAIN immediately after setup. Caddy automatically
retries certificate issuance. HTTPS on the new names is pending public DNS
propagation; do not report it as verified yet. Existing vtevents.us health passed.

After propagation, verify both HTTPS names and a deep link such as
`https://mygobbler.us/?page=auth`, then confirm the final app loads on vtevents.us.
