#!/usr/bin/env bash
#
# Deploy V Turn AI on the VPS.
#
# The rule this script exists to enforce: never restart the app unless a build
# actually succeeded. Restarting after a failed build removes `.next` from under
# a running process and takes the site down, which is how every outage during
# the August 2026 launch week happened.
#
# Usage:  ./scripts/deploy.sh
#
set -euo pipefail

APP_NAME="${APP_NAME:-vturnai}"
APP_DIR="${APP_DIR:-/root/vturnai}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/login}"
HEALTH_RETRIES="${HEALTH_RETRIES:-15}"

cd "$APP_DIR"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mDEPLOY FAILED: %s\033[0m\n' "$1" >&2; exit 1; }

# --- 1. Refuse to deploy over hand-edited files -----------------------------
# Editing directly on the server is what caused the server and the repository
# to drift apart. If that has happened, stop and make it visible rather than
# silently discarding the edits in the pull below.
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short
  fail "the working tree has uncommitted changes. Commit them, or run 'git checkout -- .' to discard, then deploy again."
fi

# --- 2. Fetch and fast-forward ----------------------------------------------
say "Fetching origin"
git fetch --prune origin

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/${BRANCH}")"

if [[ "$LOCAL" == "$REMOTE" ]]; then
  say "Already at $(git rev-parse --short HEAD) — rebuilding anyway"
else
  say "Updating ${BRANCH}: $(git rev-parse --short HEAD) -> $(git rev-parse --short "origin/${BRANCH}")"
  git merge --ff-only "origin/${BRANCH}" \
    || fail "cannot fast-forward. The server has commits that are not on origin; run 'git reset --hard origin/${BRANCH}' to discard them."
fi

# --- 3. Install dependencies only when the lockfile moved -------------------
if ! git diff --quiet "${LOCAL}" HEAD -- package-lock.json package.json 2>/dev/null; then
  say "Lockfile changed — installing dependencies"
  npm ci || fail "npm ci failed"
else
  say "Dependencies unchanged — skipping install"
fi

# --- 4. Build, keeping the live build until the new one succeeds ------------
say "Building"
ROLLBACK=0
if [[ -d .next ]]; then
  rm -rf .next.prev
  mv .next .next.prev
  ROLLBACK=1
fi

if npm run build; then
  say "Build succeeded"
  rm -rf .next.prev
else
  if [[ "$ROLLBACK" == "1" ]]; then
    say "Build failed — restoring the previous build and leaving the app running"
    rm -rf .next
    mv .next.prev .next
  fi
  fail "the build did not complete. The running app was left untouched."
fi

# --- 5. Restart, then prove it actually answers -----------------------------
say "Restarting ${APP_NAME}"
pm2 restart "$APP_NAME" --update-env

say "Waiting for a healthy response from ${HEALTH_URL}"
for attempt in $(seq 1 "$HEALTH_RETRIES"); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)"
  if [[ "$CODE" == "200" ]]; then
    say "Healthy (HTTP 200) after ${attempt}s — deployed $(git rev-parse --short HEAD)"
    pm2 save >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 1
done

pm2 logs "$APP_NAME" --lines 40 --nostream || true
fail "the app restarted but never returned HTTP 200. Logs are above."
