#!/usr/bin/env bash

set -euo pipefail

SERVER_HOST="root@167.233.203.132"
SERVER_REPO_PATH="/opt/pflegemittelboxmcp"
SERVER_APP_PATH="/opt/pflegemittelboxmcp/server"
DEPLOY_BRANCH="cursor/jun30-baseline-stabilization-6983"
PM2_PROCESS_NAME="pflegemittelbox-mcp"
HEALTH_URL="https://leapingai-api.pflegemittelbox.de/health"
EXPECTED_BUILD="stabilization-call-hardening-v4"

COMMIT_MESSAGE="${1:-}"

step() {
  printf '\n==> %s\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1"
}

die() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_clean_commit_state_for_push() {
  if git diff --cached --quiet && git diff --quiet; then
    warn "No local changes detected. Skipping commit step."
    return 0
  fi

  step "Staging local changes"
  git add .

  if git diff --cached --quiet; then
    warn "Nothing staged after git add. Skipping commit step."
    return 0
  fi

  step "Committing local changes"
  git commit -m "$COMMIT_MESSAGE"

  step "Pushing local changes"
  git push
}

step "Checking local git status"
git status --short

if [[ -n "$COMMIT_MESSAGE" ]]; then
  warn "A commit message was provided. This script will run: git add . && git commit -m \"$COMMIT_MESSAGE\" && git push"
else
  warn "No commit message provided. Only already-pushed code will be deployed."
  warn "Local unpushed changes will NOT be deployed."
fi

printf '\nProceed with MCP deployment to %s? [y/N]: ' "$SERVER_HOST"
read -r CONFIRM

case "$CONFIRM" in
  y|Y|yes|YES)
    ;;
  *)
    die "Deployment cancelled."
    ;;
esac

if [[ -n "$COMMIT_MESSAGE" ]]; then
  require_clean_commit_state_for_push
fi

step "Running remote deploy on ${SERVER_HOST}"
ssh "$SERVER_HOST" "
  set -euo pipefail
  echo '==> Remote: update repository'
  cd '$SERVER_REPO_PATH'
  git fetch origin '$DEPLOY_BRANCH'
  git checkout '$DEPLOY_BRANCH'
  git pull origin '$DEPLOY_BRANCH'
  echo "==> Remote: on branch \$(git branch --show-current) @ \$(git rev-parse --short HEAD)"

  echo '==> Remote: install dependencies'
  cd '$SERVER_APP_PATH'
  npm install

  echo '==> Remote: run tests'
  npm test

  echo '==> Remote: build'
  npm run build

  echo '==> Remote: verify compiled dist (what PM2 runs)'
  npm run verify-deploy

  echo '==> Remote: deployment preflight (source simulation)'
  node --import tsx src/tools/verification-deployment-preflight.ts

  echo '==> Remote: restart PM2'
  pm2 restart '$PM2_PROCESS_NAME' --update-env

  echo '==> Remote: PM2 status'
  pm2 status '$PM2_PROCESS_NAME'
"

step "Checking public health endpoint"
HEALTH_JSON="$(curl --fail --silent --show-error "$HEALTH_URL")"
printf '%s\n' "$HEALTH_JSON"

if ! printf '%s' "$HEALTH_JSON" | grep -q "$EXPECTED_BUILD"; then
  die "Health endpoint missing verification_build_id=$EXPECTED_BUILD — live server is still on old code."
fi

printf '\n'
step "Deployment finished"
