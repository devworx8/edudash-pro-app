#!/bin/bash

# Set PayFast credentials using npx (no Docker needed!)
# Non-interactive: provide values via environment variables.
#
# Required env:
# - PAYFAST_MODE: sandbox|production|live (default: sandbox)
# - PAYFAST_MERCHANT_ID
# - PAYFAST_MERCHANT_KEY
# Optional env:
# - PAYFAST_TEST_EMAIL (default: test@edudashpro.org.za)
# - PAYFAST_PASSPHRASE (required only for production/live)
# - WEB_BASE_URL (default: https://www.edudashpro.org.za)
# - SUPABASE_PROJECT_REF (default: lvvvjywrmpcqrpvuptdi)

set -e

echo "🔐 Setting PayFast credentials using npx supabase..."
echo ""

# Check if npx is available
if ! command -v npx &> /dev/null; then
  echo "❌ npx not found. Please install Node.js first."
  exit 1
fi

SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-lvvvjywrmpcqrpvuptdi}"
PAYFAST_MODE="${PAYFAST_MODE:-sandbox}"
PAYFAST_MERCHANT_ID="${PAYFAST_MERCHANT_ID:-}"
PAYFAST_MERCHANT_KEY="${PAYFAST_MERCHANT_KEY:-}"
PAYFAST_TEST_EMAIL="${PAYFAST_TEST_EMAIL:-test@edudashpro.org.za}"
WEB_BASE_URL="${WEB_BASE_URL:-https://www.edudashpro.org.za}"

if [ -z "$PAYFAST_MERCHANT_ID" ] || [ -z "$PAYFAST_MERCHANT_KEY" ]; then
  echo "❌ Missing required env vars."
  echo "   Please export:"
  echo "   - PAYFAST_MERCHANT_ID"
  echo "   - PAYFAST_MERCHANT_KEY"
  echo ""
  echo "Example (sandbox):"
  echo "  PAYFAST_MODE=sandbox PAYFAST_MERCHANT_ID=... PAYFAST_MERCHANT_KEY=... WEB_BASE_URL=https://www.edudashpro.org.za ./set-payfast-secrets-npx.sh"
  exit 1
fi

mode_lc="$(echo "$PAYFAST_MODE" | tr '[:upper:]' '[:lower:]')"
if [ "$mode_lc" = "production" ] || [ "$mode_lc" = "live" ]; then
  if [ -z "${PAYFAST_PASSPHRASE:-}" ]; then
    echo "❌ PAYFAST_PASSPHRASE is required for production/live mode."
    echo "   Export PAYFAST_PASSPHRASE then rerun."
    exit 1
  fi
  echo "⚠️  Using PRODUCTION/LIVE mode - these will process REAL payments!"
else
  echo "✅ Using SANDBOX mode (testing)."
fi
echo ""

# Set secrets
echo "📝 Setting PayFast secrets..."
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" PAYFAST_MODE="${PAYFAST_MODE}"
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" PAYFAST_MERCHANT_ID="${PAYFAST_MERCHANT_ID}"
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" PAYFAST_MERCHANT_KEY="${PAYFAST_MERCHANT_KEY}"
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" PAYFAST_TEST_EMAIL="${PAYFAST_TEST_EMAIL}"

# Critical: PayFast ITN cannot send Authorization header to Supabase gateway; use web proxy endpoint.
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" PAYFAST_NOTIFY_URL="${WEB_BASE_URL%/}/api/payfast/webhook"
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" PAYFAST_RETURN_URL="${WEB_BASE_URL%/}/landing?flow=payment-return"
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" PAYFAST_CANCEL_URL="${WEB_BASE_URL%/}/landing?flow=payment-cancel"

if [ "$mode_lc" = "production" ] || [ "$mode_lc" = "live" ]; then
  npx supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" PAYFAST_PASSPHRASE="${PAYFAST_PASSPHRASE}"
  echo "✅ PayFast passphrase set"
fi

echo ""
echo "✅ PayFast secrets set successfully!"
echo ""
echo "📋 Summary:"
echo "   Project: ${SUPABASE_PROJECT_REF}"
echo "   Mode: ${PAYFAST_MODE}"
echo "   Merchant ID: ${PAYFAST_MERCHANT_ID}"
echo "   Merchant Key: (set)"
echo "   Notify URL: ${WEB_BASE_URL%/}/api/payfast/webhook"
echo "   Return URL: ${WEB_BASE_URL%/}/landing?flow=payment-return"
echo "   Cancel URL: ${WEB_BASE_URL%/}/landing?flow=payment-cancel"
echo ""
echo "🔍 Verify secrets:"
echo "   npx supabase secrets list | grep PAYFAST"
echo ""


