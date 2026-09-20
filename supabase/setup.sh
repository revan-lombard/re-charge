#!/usr/bin/env bash
# One-shot Supabase deploy for the Re-Charge backend.
# Run from the repo root ON YOUR OWN MACHINE (this needs your Supabase login and
# network access — it can't run from the Claude sandbox).
#
#   ./supabase/setup.sh <project-ref>
#
# <project-ref> is the id in your dashboard URL: app.supabase.com/project/<ref>
# For this project it's: aqwdncyihcbktbbuvvzd
set -euo pipefail

REF="${1:-}"
if [ -z "$REF" ]; then echo "usage: ./supabase/setup.sh <project-ref>"; exit 1; fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install it first:"
  echo "  npm i -g supabase     # or: brew install supabase/tap/supabase"
  exit 1
fi

echo "==> Logging in (opens a browser if needed)"
supabase login || true

echo "==> Linking project $REF"
supabase link --project-ref "$REF"

echo "==> Applying database migrations (idempotent — safe if you already ran the SQL)"
supabase db push

if [ -f supabase/.env ]; then
  echo "==> Setting function secrets from supabase/.env"
  supabase secrets set --env-file supabase/.env
else
  echo "!! supabase/.env not found. Copy supabase/.env.example to supabase/.env,"
  echo "   fill in your Yoco keys (and optionally Resend), then re-run, or run:"
  echo "   supabase secrets set --env-file supabase/.env"
fi

echo "==> Deploying Edge Functions (phase 1 + phase 2)"
supabase functions deploy \
  project-intake create-yoco-checkout yoco-webhook \
  google-oauth-start google-oauth-callback analytics-properties analytics-sync monthly-report

echo
echo "Done. Your function URLs:"
for f in project-intake create-yoco-checkout yoco-webhook \
         google-oauth-start google-oauth-callback analytics-properties analytics-sync monthly-report; do
  echo "  https://$REF.supabase.co/functions/v1/$f"
done
echo
echo "Phase 2 functions won't work until you set the Google secrets + TOKEN_ENCRYPTION_KEY"
echo "+ SYNC_SECRET (see BACKEND.md) and re-run 'supabase secrets set --env-file supabase/.env'."
echo
echo "Next:"
echo "  1. Point ENQUIRY_ENDPOINT in config.js at the project-intake URL to store"
echo "     submissions in the database (test it before switching off Formspree)."
echo "  2. Add the yoco-webhook URL as a webhook in the Yoco dashboard and put its"
echo "     signing secret in supabase/.env as YOCO_WEBHOOK_SECRET, then re-run"
echo "     'supabase secrets set --env-file supabase/.env'."
echo "  3. Seed yourself as staff — see supabase/seed.sql."
