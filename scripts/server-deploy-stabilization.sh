#!/usr/bin/env bash
# Run ON THE HETZNER SERVER as root (root@mcp-leapingai), NOT on your Mac.
# Usage: bash /opt/pflegemittelboxmcp/scripts/server-deploy-stabilization.sh

set -euo pipefail

REPO="/opt/pflegemittelboxmcp"
SERVER="$REPO/server"
BRANCH="cursor/jun30-baseline-stabilization-6983"
PM2_NAME="pflegemittelbox-mcp"
HEALTH_URL="https://leapingai-api.pflegemittelbox.de/health"
EXPECTED_BUILD="stabilization-plz-method-v3"

step() { printf '\n==> %s\n' "$1"; }
die() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }

[[ "$(hostname)" != *"mcp-leapingai"* ]] && [[ -d "$REPO" ]] || {
  if [[ ! -d "$REPO" ]]; then
    die "Repo not found at $REPO — are you on the Hetzner server (root@mcp-leapingai)?"
  fi
}

step "Before: $(hostname) pwd=$(pwd)"
cd "$REPO"

step "Git: fetch and hard-reset to latest $BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
COMMIT="$(git rev-parse --short HEAD)"
echo "On $BRANCH @ $COMMIT"

step "Sanity: expect verify-deploy script"
[[ -f "$SERVER/scripts/verify-deploy.mjs" ]] || die "scripts/verify-deploy.mjs missing — still on old commit? Got $COMMIT"

cd "$SERVER"
step "npm install"
npm install

step "npm test (expect 149 passed)"
npm test

step "npm run build"
npm run build

step "npm run verify-deploy (tests COMPILED dist — what PM2 runs)"
npm run verify-deploy

step "preflight (expect Build ID + 25 passed)"
node --import tsx src/tools/verification-deployment-preflight.ts

step "pm2 restart"
pm2 restart "$PM2_NAME" --update-env
sleep 2
pm2 status "$PM2_NAME"

step "health check"
for i in 1 2 3 4 5; do
  HEALTH="$(curl -sS "$HEALTH_URL" || true)"
  if echo "$HEALTH" | grep -q "$EXPECTED_BUILD"; then
    echo "$HEALTH"
    echo ""
    echo "DEPLOY OK — verification_build_id=$EXPECTED_BUILD"
    exit 0
  fi
  if echo "$HEALTH" | grep -q '"ok":true'; then
    echo "$HEALTH"
    die "Health OK but missing verification_build_id=$EXPECTED_BUILD — PM2 may be running old dist. Run: pm2 logs $PM2_NAME --lines 50"
  fi
  echo "Waiting for health (attempt $i)..."
  sleep 2
done

pm2 logs "$PM2_NAME" --lines 30 --nostream || true
die "Health check failed or wrong build. See pm2 logs above."
