# Vultr deployment

The owner requires **$0 beyond promotional credits and a hard cap**, and chose Vultr rather than Render. The $100 MLH credit expires after 30 days; the account's resource limit is not a stop-at-credit-zero cap. Do not create additional paid resources. On 2026-09-19 the signed-in console showed an existing `vtevents-production` Ubuntu 24.04 server at `45.77.222.255` (2 GB, 1 vCPU, New Jersey, $0.03 accrued). Its creation occurred outside this checkout's deployment session. A hard spending cap/free-compute approval has not been verified. Powering off does not stop Vultr billing.

The owner selected `vtevents.us`. Porkbun DNS now has root A `45.77.222.255` and `www` CNAME `vtevents.us` (TTL 600). This is DNS preparation, not evidence of a running HTTPS application. Server access, Atlas host allowlisting, production credential rotation, deployment and public verification are still in progress; consult `NEXT_AGENT_PROMPT.md` for the latest checkpoint.

This deployment serves the Expo export and Node API on one origin behind Caddy HTTPS. Atlas remains the database. Startup/hourly source and private-connection refreshes and minute analytics retries run inside the continuously running Node process. No paid cron or extra services are required.

## Connect to the existing Vultr account

API authentication is separate from permission to provision billable resources. The historical inventory records a successful API check, but the current workspace account and instance-list checks have also passed; see `docs/RESOURCES.md` for the checkpoint.

1. In Vultr **Account → API**, enable API access and create a fresh key. The previously exposed key recorded in `docs/RESOURCES.md` needs rotation. Follow [Vultr API setup](https://docs.vultr.com/platform/other/api/enable-user-api-access).
2. In API Access Control, allow the current execution host's outbound IP. The checker prefers IPv4 to match IPv4 outbound-IP lookups; allow the IPv4 address used by this execution host. The initial connection failure was an IPv6/IPv4 mismatch, not a missing saved IPv4 entry. Use a narrow address entry and recheck if the execution environment changes; do not open access to every IP. See [Vultr access controls](https://docs.vultr.com/platform/other/api/manage-api-access-control).
3. Save the key alone in ignored `work/vultr-api-key` with file mode `0600`, or supply `VULTR_API_KEY` through a secure environment. Do not put infrastructure credentials in the app's `.env.production`, frontend, source code, shell history or chat. `work/` is excluded from Git and the Docker build context.
4. Run `node deploy/vultr-access.mjs`. An optional argument can identify a different owner-readable key file. This performs only `GET /v2/account` and `GET /v2/instances?per_page=100` against the fixed Vultr API hostname, with redirects disabled and no automatic retries. It prints sanitized success/failure receipts, numeric billing fields when present, and the first page's instance count/pagination flag. It never prints instance passwords, identity details, keys or full API responses.

HTTP 401 can indicate a rejected key or an IP restriction (the checker distinguishes explicit IP errors); 403 requires checking IP access controls and permissions; 429 means retry later. A successful account check followed by a failed instance check is partial access, not complete verification. A displayed balance does not establish promotional expiry, free-compute approval, or a hard spending cap. Check those separately before provisioning.

## Once a cost-safe Vultr instance is available

1. Use a supported Ubuntu LTS image and an SSH key. Only expose TCP 80/443 publicly; limit SSH to the administrator IP. Install Docker Engine and Compose **2.30 or newer** using [Docker's official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).
2. Point an owned hostname's DNS to the instance. Buying a domain requires separate owner approval. Use the private JARA-org/vtevents repository with a read-only deploy key, or transfer a clean source checkout; never copy local `work`, `.env`, or credentials into an image.
3. Add the instance's fixed outbound IP as a `/32` Atlas network entry. The `my-little-gobbler-app` user only has `readWrite` on `my_little_gobbler`, restricted to the Gobbler cluster. Keep the existing narrow network rules; do not add `0.0.0.0/0`.
4. Create root-readable `.env.production` in the checkout from `deploy/production.env.example`. Use unquoted, single-line `NAME=value` entries; Compose reads this file in raw mode so literal `$` and `#` in credentials survive unchanged. Do not use shell interpolation or inline comments. Set the Atlas URI, Gemini key and fresh independent auth/encryption/analytics/job secrets. Add optional integration credentials only when their access is verified. `TOKEN_ENCRYPTION_KEY` must be 64 hexadecimal characters. Keep the file mode `0600` and out of Git. Never reuse synthetic local QA account secrets for a public deployment.
5. Set `GOBBLER_DOMAIN` in the shell to the owned hostname. Run the preflight below, then `docker compose -f deploy/compose.yaml up -d --build`. A build needs more memory than the running service; use at least 2 GB or build the image on a separate machine and securely transfer it. The runtime image runs as the non-root Node user, with read-only filesystem and no host port exposed for the API.
6. Check `docker compose -f deploy/compose.yaml ps` and `https://HOST/api/health`. Caddy obtains and renews TLS certificates. Configure OAuth callback URLs under the same HTTPS hostname before testing connections.
7. Verify sign-up/sign-in, onboarding persistence, live discovery, details/save/ICS, opt-in Gemini, a known conflict and rejection of anonymous access in a real browser. Retired demo routes must remain unavailable. Test after restarting the app container. Rotate setup credentials and remove any temporary workstation Atlas network rule after production verification.

Containers rotate their logs; application failures are redacted. Caddy access logging is deliberately not enabled, so OAuth callback query strings are not collected in access logs. The container health check requires HTTP success plus `ok`, `database` and `accounts` flags. Those flags describe initialized services, not a fresh Atlas ping; inspect database connectivity, source freshness and provider status separately. An unhealthy container is not automatically restarted by Compose, so operators must inspect and resolve the failure. Cloud billing/credit controls remain the provider's responsibility: no local script or reminder is represented as a hard spending cap.

## Preflight and launch checks

Run from the repository root with Node 22 or newer. These checks do not provision resources or authorize spending:

```sh
export GOBBLER_DOMAIN=your.owned.hostname
node deploy/preflight.mjs
docker compose -f deploy/compose.yaml config --quiet
docker compose -f deploy/compose.yaml build
```

The preflight checks file permissions, hostname/origin, Atlas URI, required independent secrets and complete optional credential groups. It prints field errors only. It cannot prove a secret is random, rotated or valid, that DNS points to the server, that Atlas permits the server IP, or that billing is capped. Generate each secret independently with `openssl rand -hex 32`; preserve the encryption key and analytics salt across routine deployments. Changing them requires a separate data migration/reconnection plan.

Use `config --quiet`: plain `docker compose config` renders secret values. Keep commands in the same shell so `GOBBLER_DOMAIN` remains set. Docker access is privileged; protect the host and env file accordingly. Raw env-file behavior is documented in [Docker Compose environment files](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

After cost-safe hosting is confirmed and DNS/Atlas access is ready:

```sh
docker compose -f deploy/compose.yaml up -d --build
docker compose -f deploy/compose.yaml ps
node deploy/smoke.mjs "https://${GOBBLER_DOMAIN}"
```

The smoke check performs only anonymous GETs: landing HTML, configured health flags, v2 bootstrap, 401 rejection on account/events/recommendations, and 404 on the retired demo listing. It requires normal TLS verification, rejects redirects and exits nonzero on failure. It does not create users, refresh sources, spend AI credits or write calendars. Follow it with the authenticated browser checks in step 7; passing these probes alone is not full production verification.

For updates, record the deployed commit and retain the previous local image before rebuilding. Re-run preflight and smoke after every update/restart. For rollback, use the previous reviewed checkout/image with the same env file and Caddy volumes, then repeat verification. Never use `down --volumes` during routine updates; Caddy's certificate state is persistent. Rollback does not undo database migrations or provider writes.

## Current price observations (not a purchase authorization)

Vultr's authenticated plans API on 2026-09-19 listed `vc2-1c-1gb` at $5/month and `vc2-1c-2gb` at $10/month. Availability varies by region. No add-ons, backups, load balancer, or paid resources have been ordered.

References: [Vultr server billing](https://docs.vultr.com/support/platform/billing/how-am-i-billed-for-my-servers), [account limits](https://docs.vultr.com/platform/billing/manage-account-limits), [Caddy HTTPS](https://caddyserver.com/docs/automatic-https).
