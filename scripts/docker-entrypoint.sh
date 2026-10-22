#!/bin/sh
set -eu
npm run prisma:migrate:deploy
# Seeding is an explicit one-time operation, never part of every restart.
if [ "${RUN_SEED:-false}" = "true" ]; then
  npm run prisma:seed
fi
exec node dist/src/main.js
