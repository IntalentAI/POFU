#!/bin/sh
# Container start-up: restore the SQLite DB from its replica, migrate, then serve
# while Litestream streams every change back to Cloud Storage.
set -eu

mkdir -p "$(dirname "$DB_PATH")"
FRESH=false

if [ -n "${LITESTREAM_REPLICA_URL:-}" ]; then
  echo "[entrypoint] restoring $DB_PATH from $LITESTREAM_REPLICA_URL (if a replica exists)"
  litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists "$DB_PATH"
else
  echo "[entrypoint] WARNING: LITESTREAM_REPLICA_URL is not set — data will be lost when this container stops"
fi
[ -f "$DB_PATH" ] || FRESH=true

npx prisma migrate deploy

if [ "$FRESH" = true ] && [ "${SEED_DEMO:-false}" = "true" ]; then
  echo "[entrypoint] new database — loading demo workspace"
  node dist/seed.js
fi

if [ -n "${LITESTREAM_REPLICA_URL:-}" ]; then
  exec litestream replicate -config /etc/litestream.yml -exec "node server.js"
else
  exec node server.js
fi
