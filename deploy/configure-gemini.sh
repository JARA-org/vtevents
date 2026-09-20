#!/usr/bin/env bash
# Config-only activation after the operator confirms Free Tier and disabled billing.
# Shares the deployment lock, retains the running image, restores env on failure.
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]]
exec 9>/var/lock/gobbler-deploy.lock
flock -w 300 9
script_dir=$(cd "$(dirname "$0")" && pwd)
project=my-little-gobbler
mapfile -t containers < <(docker ps -q --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=app')
[[ ${#containers[@]} == 1 ]] || { echo 'Expected one running production app.' >&2; exit 1; }
current=${containers[0]}
compose=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$current")
[[ "$compose" != *,* && -f "$compose" ]]
compose=$(realpath "$compose")
[[ "$compose" == /opt/*/deploy/compose.yaml ]]
release=$(dirname "$(dirname "$compose")")
export GOBBLER_IMAGE
GOBBLER_IMAGE=$(docker inspect --format '{{.Config.Image}}' "$current")
export GOBBLER_DOMAIN=mygobbler.us
backup=$(mktemp "$release/.env.production.before-assistant.XXXXXX")
cp -- "$release/.env.production" "$backup"
rollback() {
  trap - ERR
  cp -- "$backup" "$release/.env.production"
  docker compose --project-name "$project" -f "$compose" up -d --no-deps --no-build --wait --wait-timeout 180 app
  echo 'Activation failed; restored previous configuration.' >&2
}
trap rollback ERR
docker run --rm --network none --read-only --user 0 --cap-drop ALL --security-opt no-new-privileges:true \
  -v "$script_dir:/activation:ro" -v "$release:/release:rw" \
  --entrypoint node "$GOBBLER_IMAGE" /activation/gemini-config.mjs /release/.env.production
docker compose --project-name "$project" -f "$compose" config --quiet
docker compose --project-name "$project" -f "$compose" up -d --no-deps --no-build --force-recreate --wait --wait-timeout 180 app
docker compose --project-name "$project" -f "$compose" exec -T app node -e 'process.exit(process.env.GEMINI_FREE_TIER_CONFIRMED === "true" && !!process.env.GEMINI_API_KEY && (!process.env.GEMINI_MODEL || process.env.GEMINI_MODEL === "gemini-3.5-flash-lite") ? 0 : 1)'
trap - ERR
rm -- "$backup"
echo 'Production Gemini activation applied and app health verified.'
