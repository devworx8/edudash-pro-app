#!/bin/bash

# Vercel Environment Variables Setup Script
# Run this to quickly add deployment notification variables to Vercel

set -e

echo "🚀 EduDash Pro - Vercel Environment Variables Setup"
echo "=================================================="
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Login to Vercel
echo "🔐 Logging in to Vercel..."
vercel login

# Link project (if not already linked)
echo "🔗 Linking to Vercel project..."
cd "$(dirname "$0")" # Go to script directory
vercel link

echo ""
echo "📋 Adding environment variables..."
echo ""

# Add DEPLOYMENT_WEBHOOK_SECRET
echo "1️⃣ Adding DEPLOYMENT_WEBHOOK_SECRET..."
vercel env add DEPLOYMENT_WEBHOOK_SECRET production <<EOF
edudash-deploy-webhook-2024
EOF

# Add DEPLOYMENT_WEBHOOK_URL (optional but recommended)
echo ""
echo "2️⃣ Adding DEPLOYMENT_WEBHOOK_URL..."
vercel env add DEPLOYMENT_WEBHOOK_URL production <<EOF
https://edudashpro.org.za/api/notifications/deployment
EOF

echo ""
echo "✅ Core environment variables added!"
echo ""

# Prompt for optional Slack webhook
read -p "📢 Do you want to add Slack webhook? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter Slack webhook URL: " SLACK_URL
    if [ ! -z "$SLACK_URL" ]; then
        vercel env add SLACK_DEPLOYMENT_WEBHOOK production <<EOF
$SLACK_URL
EOF
        echo "✅ Slack webhook added!"
    fi
fi

echo ""

# Prompt for optional Discord webhook
read -p "📢 Do you want to add Discord webhook? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter Discord webhook URL: " DISCORD_URL
    if [ ! -z "$DISCORD_URL" ]; then
        vercel env add DISCORD_DEPLOYMENT_WEBHOOK production <<EOF
$DISCORD_URL
EOF
        echo "✅ Discord webhook added!"
    fi
fi

echo ""
echo "=================================================="
echo "✅ Setup complete!"
echo ""
echo "📋 Summary of variables added:"
vercel env ls

echo ""
echo "🚀 Next steps:"
echo "1. Trigger a deployment: git push"
echo "2. Check deployment logs for success message"
echo "3. Test endpoint: curl https://edudashpro.org.za/api/notifications/deployment"
echo ""
echo "📖 Full documentation: VERCEL_ENV_SETUP.md"
echo ""
