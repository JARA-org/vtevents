# Automatic Vultr deployment

`.github/workflows/deploy-vultr.yml` deploys pushes to `main` in JARA-org/vtevents. Manual runs are also restricted to `main`. Pull requests and other branches do not deploy. The production job is serialized and a running deployment is not canceled by a newer push.

The workflow checks types/contracts/architecture, runs tests, then builds the Docker production image (including the frontend build) on GitHub. It transfers the image over SSH to the existing VPS at 45.77.222.255. No new cloud resources or registry are required. GitHub Actions usage is subject to the repository's existing runner allowance.

Immediately before transfer it compares the candidate commit with current main and skips superseded commits, including old manual reruns. A push arriving after that check queues a subsequent deployment.

## Required repository secrets

Configure under Settings → Secrets and variables → Actions:

- `VULTR_SSH_PRIVATE_KEY`: dedicated deployment private key. Never commit it. The newly generated local key is in ignored `work/ci-deploy/id_ed25519`; the matching `.pub` belongs in the VPS root user's `authorized_keys`. The key pasted into chat is exposed and is not used by this workflow.
- `VULTR_SSH_KNOWN_HOSTS`: the independently verified server host public key in known_hosts format: `45.77.222.255 ssh-ed25519 PUBLIC_KEY_DATA`. Obtain it from `/etc/ssh/ssh_host_ed25519_key.pub` through the authenticated Vultr console. Do not trust an unverified network key scan. This is the server's identity, not the deployment key.

The private key is saved as a GitHub repository secret. Treat repository workflow-edit access as privileged server access. The existing root account is used because Docker deployment is already privileged. An `authorized_keys` entry prefixed with `restrict` disables forwarding, PTYs and agent forwarding while allowing deployment commands. It does not confine the account to a single command.

## Existing-host requirements and behavior

The script requires Docker Compose with `--wait` and raw env-file support (2.30+), one running app in project `my-little-gobbler`, and its original Compose file and `.env.production` still present under `/opt/.../deploy/compose.yaml`. It discovers those paths from the running app's Compose labels; it does not assume historical `/opt/vtevents/current` still exists.

Every attempt gets a unique `/opt/gobbler-releases/COMMIT-RUN-ATTEMPT` directory. Production settings are copied locally on the VPS with mode 0600, with retired narration credentials removed from the new copy; they are never uploaded to GitHub or replaced from a workstation env file. Preflight runs before the app is replaced. Caddy and its persistent certificate volumes remain unchanged. The release bundle contains deploy scripts and the built image, not the full source checkout.

After replacement, the script requires five minutes of healthy checks with zero restarts, then runs the public HTTPS smoke checks. Failure attempts to restore the previous image using its original Compose file. This catches delayed startup failures but is not continuous monitoring. A failed rollback is reported as an error. Previous images/configuration remain available; no database rollback or automatic release/image pruning is performed. Monitor disk usage and retain the active Caddy configuration directory during manual cleanup.

The operator approved IPv4 SSH access from any address for GitHub's changing runner IPs. Password and keyboard-interactive login are disabled, and the previously exposed key was removed from authorized_keys. The dedicated deployment key and verified host pin are configured as repository secrets.

The workflow needs to be committed and pushed before automatic deployment exists. Successful secret creation alone does not prove SSH access or a successful release; verify the first Actions run. Future pushes to main deploy automatically once prerequisites are complete.
