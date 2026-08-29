#!/usr/bin/env bash
#
# Install the job-queue schedule on the VPS.
#
# The schedule in vercel.json only runs on Vercel. On a self-hosted VPS nothing
# calls the cron endpoints, so every enqueued job — Search Console syncs, GA4
# syncs, crawls, AI scans — sits in the `jobs` table forever and the product
# looks broken while behaving exactly as written.
#
# Safe to re-run: entries are replaced, never duplicated.
#
# Usage:  ./scripts/setup-cron.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/root/vturnai}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env.local}"
BASE_URL="${CRON_TARGET:-http://127.0.0.1:3000}"
LOG_FILE="${CRON_LOG:-/var/log/vturnai-cron.log}"
MARKER="# vturnai-cron"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$1" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "Cannot find $ENV_FILE"

# --- 1. The shared secret ---------------------------------------------------
# Read without sourcing the file: .env.local holds values with characters the
# shell would otherwise try to interpret.
SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"

if [[ -z "$SECRET" ]]; then
  say "CRON_SECRET is not set — generating one"
  SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
  printf '\nCRON_SECRET=%s\n' "$SECRET" >> "$ENV_FILE"
  echo "Added CRON_SECRET to $ENV_FILE"
  echo "The app must be restarted to pick it up: pm2 restart vturnai --update-env"
fi

# --- 2. Install the schedule ------------------------------------------------
say "Installing crontab entries"

# process-jobs runs with a 50s internal budget, so allow 55s before curl gives
# up. daily is a heavier batch and gets five minutes.
NEW_CRON="$(
  crontab -l 2>/dev/null | grep -v "$MARKER" || true
  cat <<EOF
*/5 * * * * curl -fsS -m 55 -H "Authorization: Bearer ${SECRET}" ${BASE_URL}/api/cron/process-jobs >> ${LOG_FILE} 2>&1 ${MARKER}
15 2 * * * curl -fsS -m 300 -H "Authorization: Bearer ${SECRET}" ${BASE_URL}/api/cron/daily >> ${LOG_FILE} 2>&1 ${MARKER}
EOF
)"

echo "$NEW_CRON" | crontab -
crontab -l | grep "$MARKER"

# --- 3. Prove the endpoint actually answers --------------------------------
say "Test-firing the worker"
CODE="$(curl -s -o /tmp/vturnai-cron-test.json -w '%{http_code}' -m 55 \
  -H "Authorization: Bearer ${SECRET}" "${BASE_URL}/api/cron/process-jobs" || true)"

case "$CODE" in
  200)
    echo "Worker responded 200:"
    cat /tmp/vturnai-cron-test.json 2>/dev/null || true
    echo
    say "Done. Jobs will now be processed every 5 minutes."
    ;;
  401)
    fail "Worker returned 401. The running app has a different CRON_SECRET than $ENV_FILE — restart it with: pm2 restart vturnai --update-env"
    ;;
  000)
    fail "Could not reach ${BASE_URL}. Is the app running? Check: pm2 status"
    ;;
  *)
    fail "Worker returned HTTP ${CODE}. Check: pm2 logs vturnai --lines 40"
    ;;
esac
