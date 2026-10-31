#!/bin/sh
# Pulls main from the public repo. The container mounts site/ directly, so a pull is a deploy.
# cron: */10 * * * * /opt/runtrovert/deploy/site/update.sh >/dev/null 2>&1
set -e
cd "$(dirname "$0")/../.."
git fetch --quiet --depth 1 origin main
git reset --quiet --hard origin/main

# The Listen list: GitHub builds it on the `shelf` branch, this copies it into
# deploy/site/shelf-data, which nginx serves at https://runtrovert.app/shelf/.
# Phones then only ever ask runtrovert.app. Only copies when the branch moved.
shelf=deploy/site/shelf-data
mkdir -p "$shelf/art"
if git fetch --quiet --depth 1 origin shelf 2>/dev/null; then
  rev=$(git rev-parse FETCH_HEAD)
  if [ "$rev" != "$(cat "$shelf/.rev" 2>/dev/null)" ]; then
    rm -rf "$shelf/.new" && mkdir -p "$shelf/.new"
    git archive FETCH_HEAD | tar -x -C "$shelf/.new"
    # Covers first, list last, each by rename, so a phone never gets a list whose covers aren't there yet.
    if [ -d "$shelf/.new/art" ]; then
      for f in "$shelf/.new/art/"*; do [ -f "$f" ] && mv -f "$f" "$shelf/art/"; done
    fi
    [ -f "$shelf/.new/shelf.json" ] && mv -f "$shelf/.new/shelf.json" "$shelf/shelf.json"
    rm -rf "$shelf/.new"
    # Covers no longer in any list for 60 days go.
    find "$shelf/art" -type f -mtime +60 -delete
    echo "$rev" > "$shelf/.rev"
  fi
fi

docker compose -f deploy/site/docker-compose.yml up -d --quiet-pull >/dev/null
# nginx.conf is a single-file mount, and git replaces the file on update, so the
# container keeps the old copy. Recreate it whenever the two differ.
live=$(docker exec runtrovert-site cat /etc/nginx/conf.d/default.conf | sha1sum)
[ "$live" = "$(sha1sum < deploy/site/nginx.conf)" ] || docker compose -f deploy/site/docker-compose.yml up -d --force-recreate --quiet-pull >/dev/null
