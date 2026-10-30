#!/bin/sh
# Pulls main from the public repo. The container mounts site/ directly, so a pull is a deploy.
# cron: */10 * * * * /opt/runtrovert/deploy/site/update.sh >/dev/null 2>&1
set -e
cd "$(dirname "$0")/../.."
git fetch --quiet --depth 1 origin main
git reset --quiet --hard origin/main
docker compose -f deploy/site/docker-compose.yml up -d --quiet-pull >/dev/null
