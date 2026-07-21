#!/usr/bin/env bash
# Bring up a FRESH OCM stack (no admin), run the Playwright system test (which
# also captures the README screenshots), then tear the stack down.
#
#   bash e2e/run.sh                 # full run + teardown
#   OCM_E2E_KEEP=1 bash e2e/run.sh  # leave the stack running afterwards
#   OCM_COMPOSE=/path/compose.yml … # override compose file (e.g. macOS symlink)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="${OCM_COMPOSE:-$ROOT/docker/docker-compose.yml}"

echo ">> fresh stack: down -v + up --build --wait"
docker compose -f "$COMPOSE" down -v >/dev/null 2>&1 || true
if ! docker compose -f "$COMPOSE" up -d --build --wait; then
  echo "!! stack failed to become healthy"
  docker compose -f "$COMPOSE" logs api | tail -30
  exit 1
fi

echo ">> running Playwright"
cd "$ROOT/e2e"
status=0
pnpm exec playwright test "$@" || status=$?

if [ "${OCM_E2E_KEEP:-0}" != "1" ]; then
  docker compose -f "$COMPOSE" down -v >/dev/null 2>&1 || true
fi
exit "$status"
