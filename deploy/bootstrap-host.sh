#!/usr/bin/env bash
# Operator-only setup for the dedicated Ubuntu 24.04 Vultr host. Installs Docker
# from its signed upstream apt repository and creates /opt/vtevents. Requires root;
# changes host packages/configuration, never app data or cloud resources. Commands
# stop on failure; reruns converge on the same package/config state, no transaction.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root on the deployment host.' >&2; exit 1; }
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo 'Expected Ubuntu 24.04.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
install -m 0700 -d /opt/vtevents
docker version --format '{{.Server.Version}}'
docker compose version
