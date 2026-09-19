# Vultr deployment

Hosting is intentionally pending: the owner requires **$0 beyond promotional credits and a hard cap**, and chose to wait for Vultr rather than deploy to Render. The $100 MLH credit expires after 30 days. A free-compute application was submitted on 2026-09-19 and awaits approval. The account's $1,000/month maximum instance-cost setting does not stop ongoing charges at credit exhaustion. **Do not provision a paid server until this constraint is resolved.** Powering a Vultr instance off does not stop billing; it must be destroyed. No Vultr instance has been created.

This deployment serves the Expo export and Node API on one origin behind Caddy HTTPS. Atlas remains the database. Startup/hourly source and private-connection refreshes and minute analytics retries run inside the continuously running Node process. No paid cron or extra services are required.

## Once a cost-safe Vultr instance is available

1. Use a supported Ubuntu LTS image and an SSH key. Only expose TCP 80/443 publicly; limit SSH to the administrator IP. Install Docker Engine and Compose using [Docker's official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).
2. Point an owned hostname's DNS to the instance. Buying a domain requires separate owner approval. Use the private JARA-org/vtevents repository with a read-only deploy key, or transfer a clean source checkout; never copy local `work`, `.env`, or credentials into an image.
3. Add the instance's fixed outbound IP as a `/32` Atlas network entry. The `my-little-gobbler-app` user only has `readWrite` on `my_little_gobbler`, restricted to the Gobbler cluster. Keep the existing narrow network rules; do not add `0.0.0.0/0`.
4. Create root-readable `.env.production` in the checkout using `.env.example` as names only. Set the Atlas URI, Gemini key and fresh independent auth/encryption/analytics/job secrets. Add optional integration credentials only when their access is verified. `TOKEN_ENCRYPTION_KEY` must be 64 hexadecimal characters. Keep the file mode `0600` and out of Git. Never reuse synthetic local QA account secrets for a public deployment.
5. Set `GOBBLER_DOMAIN` in the shell to the owned hostname. Run `docker compose -f deploy/compose.yaml up -d --build`. A build needs more memory than the running service; use at least 2 GB or build the image on a separate machine and securely transfer it. The runtime image runs as the non-root Node user, with read-only filesystem and no host port exposed for the API.
6. Check `docker compose -f deploy/compose.yaml ps` and `https://HOST/api/health`. Caddy obtains and renews TLS certificates. Configure OAuth callback URLs under the same HTTPS hostname before testing connections.
7. Verify sign-up/sign-in, onboarding persistence, live discovery, details/save/ICS, opt-in Gemini, a known conflict and demo separation in a real browser. Test after restarting the app container. Rotate setup credentials and remove any temporary workstation Atlas network rule after production verification.

Containers rotate their logs; application failures are redacted. Caddy access logging is deliberately not enabled, so OAuth callback query strings are not collected in access logs. The health check proves HTTP service readiness; inspect source freshness and provider status separately. Cloud billing/credit controls remain the provider's responsibility: no local script or reminder is represented as a hard spending cap.

## Current price observations (not a purchase authorization)

Vultr's authenticated plans API on 2026-09-19 listed `vc2-1c-1gb` at $5/month and `vc2-1c-2gb` at $10/month. Availability varies by region. No add-ons, backups, load balancer, or paid resources have been ordered.

References: [Vultr server billing](https://docs.vultr.com/support/platform/billing/how-am-i-billed-for-my-servers), [account limits](https://docs.vultr.com/platform/billing/manage-account-limits), [Caddy HTTPS](https://caddyserver.com/docs/automatic-https).
