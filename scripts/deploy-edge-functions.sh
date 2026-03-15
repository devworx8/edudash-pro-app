#!/bin/bash
# Deploy Edge Functions to Supabase

set -e

echo "🚀 Deploying Edge Functions to Supabase..."

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   curl -L https://supabase.com/download/cli/install.sh | sh"
    exit 1
fi

# Deploy generate-weekly-report function
echo "📤 Deploying generate-weekly-report..."
supabase functions deploy generate-weekly-report --project-ref lvvvjywrmpcqrpvuptdi

# Deploy weekly-report-cron function
echo "📤 Deploying weekly-report-cron..."
supabase functions deploy weekly-report-cron --project-ref lvvvjywrmpcqrpvuptdi

echo "✅ All Edge Functions deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Set up environment variables in Supabase dashboard"
echo "2. Create the cron job schedule"
