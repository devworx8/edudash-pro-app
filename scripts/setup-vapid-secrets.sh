#!/bin/bash
# ============================================================================
# CRITICAL: Set VAPID keys in Supabase secrets
# ============================================================================
# This script sets up the Web Push VAPID keys securely in Supabase
# Run this ONCE to configure the secrets
# ============================================================================

echo "🔐 Setting up VAPID keys in Supabase secrets..."
echo ""
echo "⚠️  IMPORTANT: The old hardcoded key has been COMPROMISED"
echo "    You MUST generate NEW keys for security"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Error: Supabase CLI not found"
    echo "   Install: npm install -g supabase"
    exit 1
fi

# Check if we're in the correct directory
if [ ! -f "supabase/config.toml" ]; then
    echo "❌ Error: Not in project root (supabase/config.toml not found)"
    exit 1
fi

echo "📋 Option 1: Generate NEW keys (RECOMMENDED - old key is compromised)"
echo "📋 Option 2: Set existing keys manually (if you already generated new keys)"
echo ""
read -p "Enter choice (1 or 2): " choice

if [ "$choice" == "1" ]; then
    echo ""
    echo "🔑 Generating NEW VAPID keys..."
    echo ""
    echo "Run the following command to generate keys:"
    echo "  npx web-push generate-vapid-keys"
    echo ""
    echo "Then run this script again with option 2, or set manually:"
    echo "  supabase secrets set VAPID_PUBLIC_KEY='<your-public-key>'"
    echo "  supabase secrets set VAPID_PRIVATE_KEY='<your-private-key>'"
    echo ""
    exit 0
fi

if [ "$choice" == "2" ]; then
    echo ""
    echo "Paste your NEW keys (do not use old/compromised keys):"
    echo ""

    read -r -p "VAPID_PUBLIC_KEY: " PUBLIC_KEY
    read -r -p "VAPID_PRIVATE_KEY: " PRIVATE_KEY
    read -r -p "VAPID_SUBJECT (default: mailto:noreply@edudashpro.org.za): " VAPID_SUBJECT

    if [ -z "$PUBLIC_KEY" ] || [ -z "$PRIVATE_KEY" ]; then
        echo "❌ Error: Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required."
        exit 1
    fi

    if [ -z "$VAPID_SUBJECT" ]; then
        VAPID_SUBJECT="mailto:noreply@edudashpro.org.za"
    fi

    echo "Setting secrets..."
    supabase secrets set VAPID_PUBLIC_KEY="$PUBLIC_KEY"
    supabase secrets set VAPID_PRIVATE_KEY="$PRIVATE_KEY"
    supabase secrets set VAPID_SUBJECT="$VAPID_SUBJECT"
    
    echo ""
    echo "✅ Secrets set (using provided keys)"
    echo ""
else
    echo "❌ Invalid choice"
    exit 1
fi

# Verify secrets are set
echo "🔍 Verifying secrets..."
supabase secrets list | grep VAPID

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Deploy the updated Edge Function: supabase functions deploy send-push"
echo "2. Generate NEW keys: npx web-push generate-vapid-keys"
echo "3. Update secrets with new keys"
echo "4. Update client-side service worker with new public key"
