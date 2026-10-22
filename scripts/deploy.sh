#!/bin/sh
set -eu
: "${1:?Usage: sh scripts/deploy.sh ghcr.io/owner/repository:commit-sha}"
export APP_IMAGE="$1"
test -f .env || { echo 'Create the production .env before deployment.' >&2; exit 1; }
docker compose -f docker-compose.production.yaml config --quiet
docker compose -f docker-compose.production.yaml pull
# Keep Postgres running and wait for the replacement API's database health check.
if ! docker compose -f docker-compose.production.yaml up -d --wait --wait-timeout 180; then
  docker compose -f docker-compose.production.yaml logs --no-color --tail=100 app
  exit 1
fi
printf '%s\n' "$APP_IMAGE" > .deployed-image
