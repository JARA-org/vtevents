#!/usr/bin/env bash
# Existing-host app deployment only. Keeps server-owned env, proxy and volumes.
# Uses a host lock; health/smoke failure restores the previous app image/config.
# No database rollback, resource provisioning, image pruning or secret output.
set -euo pipefail
umask 077
release_id=${1:-}
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
[[ $(id -u) == 0 ]] || { echo 'Deployment requires the configured root SSH account' >&2; exit 1; }
exec 9>/var/lock/gobbler-deploy.lock
flock -w 1800 9

export GOBBLER_DOMAIN=vtevents.us
export GOBBLER_IMAGE="my-little-gobbler-app:$release_id"
project=my-little-gobbler
incoming="/opt/gobbler-incoming/$release_id"
release="/opt/gobbler-releases/$release_id"
[[ ! -e "$release" ]] || { echo 'Release directory already exists; rerun as a new workflow attempt' >&2; exit 1; }
mapfile -t containers < <(docker ps -q --filter "label=com.docker.compose.project=$project" --filter 'label=com.docker.compose.service=app')
[[ ${#containers[@]} == 1 ]] || { echo 'Expected exactly one running production app; initial setup is required' >&2; exit 1; }
previous=${containers[0]}
previous_image=$(docker inspect --format '{{.Config.Image}}' "$previous")
previous_compose=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$previous")
[[ "$previous_compose" != *,* && -f "$previous_compose" ]] || { echo 'Expected one existing Compose file' >&2; exit 1; }
previous_compose=$(realpath "$previous_compose")
[[ "$previous_compose" == /opt/*/deploy/compose.yaml ]] || { echo 'Unexpected production Compose location' >&2; exit 1; }
previous_env="$(dirname "$(dirname "$previous_compose")")/.env.production"
[[ -f "$previous_env" ]] || { echo 'Existing production env not found; no container changes made' >&2; exit 1; }
docker image inspect "$previous_image" > /dev/null

mkdir -p "$release"
tar --extract --gzip --file "$incoming/release.tar.gz" --directory "$release" --no-same-owner
install -m 0600 "$previous_env" "$release/.env.production"
docker load --input "$release/image.tar.gz" > /dev/null
docker image inspect "$GOBBLER_IMAGE" > /dev/null
# Runtime image has Node; no host Node installation or production secret upload needed.
docker run --rm --network none --read-only --user 0 --cap-drop ALL \
  --security-opt no-new-privileges:true -e GOBBLER_DOMAIN \
  -v "$release:/release:ro" --entrypoint node "$GOBBLER_IMAGE" /release/deploy/preflight.mjs
docker compose --project-name "$project" -f "$release/deploy/compose.yaml" config --quiet

rollback() {
  echo 'Deployment verification failed; restoring previous app image.' >&2
  if GOBBLER_IMAGE="$previous_image" docker compose --project-name "$project" -f "$previous_compose" up -d --no-deps --no-build --wait --wait-timeout 180 app; then
    echo 'Previous app restored.' >&2
  else
    echo 'Rollback failed; operator attention required.' >&2
  fi
}
trap 'rollback' ERR
docker compose --project-name "$project" -f "$release/deploy/compose.yaml" up -d --no-deps --no-build --wait --wait-timeout 180 app
docker run --rm --network host --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  -v "$release/deploy:/checks:ro" --entrypoint node "$GOBBLER_IMAGE" /checks/smoke.mjs "https://$GOBBLER_DOMAIN"
trap - ERR
printf '%s\n' "$release_id" > "$release/DEPLOYED"
# Remove transport copies only. Keep release config and both Docker images for rollback.
rm -f -- "$release/image.tar.gz" "$incoming/release.tar.gz"
echo "Deployed $release_id successfully."
