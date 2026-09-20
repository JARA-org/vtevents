#!/usr/bin/env bash
# Operator-authorized, config-only canonical-domain migration. Retains current
# image, secrets, database and TLS volumes; rolls back env/proxy/app on failure.
# Serialized with deployment. Repeated runs safely enforce the same domain.
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]]
exec 9>/var/lock/gobbler-deploy.lock
flock -w 300 9
script_dir=$(cd "$(dirname "$0")" && pwd)
project=my-little-gobbler
mapfile -t apps < <(docker ps -q --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=app')
mapfile -t proxies < <(docker ps -q --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=caddy')
[[ ${#apps[@]} == 1 && ${#proxies[@]} == 1 ]]
app=${apps[0]}
proxy=${proxies[0]}
compose=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$app")
[[ "$compose" != *,* && -f "$compose" ]]
compose=$(realpath "$compose")
[[ "$compose" == /opt/*/deploy/compose.yaml ]]
release=$(dirname "$(dirname "$compose")")
caddyfile=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$proxy")
[[ "$caddyfile" == /opt/*/deploy/Caddyfile && -f "$caddyfile" ]]
export GOBBLER_IMAGE
GOBBLER_IMAGE=$(docker inspect --format '{{.Config.Image}}' "$app")
previous_domain=$(docker exec "$app" node -e 'console.log(new URL(process.env.APP_ORIGIN).hostname)')
[[ "$previous_domain" == vtevents.us || "$previous_domain" == mygobbler.us ]]
export GOBBLER_DOMAIN=mygobbler.us
backup=$(mktemp -d "$release/domain-backup.XXXXXX")
cp -- "$release/.env.production" "$backup/env"
cp -- "$caddyfile" "$backup/Caddyfile"
docker cp "$script_dir/Caddyfile" "$proxy:/tmp/domain-Caddyfile"
docker exec "$proxy" caddy validate --config /tmp/domain-Caddyfile --adapter caddyfile
rollback() {
  trap - ERR
  cp -- "$backup/env" "$release/.env.production"
  cat "$backup/Caddyfile" > "$caddyfile"
  docker exec "$proxy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  GOBBLER_DOMAIN="$previous_domain" docker compose --project-name "$project" -f "$compose" up -d --no-deps --no-build --wait --wait-timeout 180 app
  echo 'Domain migration failed; restored previous configuration.' >&2
}
trap rollback ERR
# Replace only the public origin; all credentials stay on the VPS.
sed '/^APP_ORIGIN=/d' "$backup/env" > "$release/.env.production"
printf '\nAPP_ORIGIN=https://mygobbler.us\n' >> "$release/.env.production"
chmod 0600 "$release/.env.production"
docker compose --project-name "$project" -f "$compose" config --quiet
docker compose --project-name "$project" -f "$compose" up -d --no-deps --no-build --wait --wait-timeout 180 app
# Keep the mounted inode; replacing the file via rename would leave a stale mount.
cat "$script_dir/Caddyfile" > "$caddyfile"
docker exec "$proxy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
curl --fail --silent --show-error --max-time 20 https://mygobbler.us/api/health > /dev/null
headers=$(curl --silent --show-error --head --max-time 20 'https://vtevents.us/?page=auth')
grep -qi '^location: https://mygobbler.us/?page=auth' <<< "$headers"
[[ $(curl --silent --show-error --max-time 20 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{}' https://vtevents.us/api/discord/interactions) == 401 ]]
trap - ERR
echo 'Canonical domain is mygobbler.us; old links redirect and signed Discord endpoint is retained.'
