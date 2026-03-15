#!/bin/bash
# Script to push EAS update after logging in as dash-t

set -e

# CRITICAL: Increase Node.js memory limit to prevent heap out of memory errors
export NODE_OPTIONS="--max-old-space-size=8192"

echo "🚀 Pushing EAS Update to Production Branch..."
echo ""

# Verify we're logged in as the correct account
echo "Checking login status..."
CURRENT_USER=$(eas whoami 2>/dev/null || echo "not logged in")

if [[ "$CURRENT_USER" != *"dash-t"* ]]; then
  echo "❌ Error: Not logged in as dash-t"
  echo "Current user: $CURRENT_USER"
  echo ""
  echo "Please run: eas login"
  echo "Then log in with dash-t credentials"
  exit 1
fi

echo "✅ Logged in as: $CURRENT_USER"
echo ""

# Push the update
echo "📤 Pushing update to production branch..."
eas update --branch production --message "Fix: Call background disconnection + media controls + status bar indicators

- Start foreground service earlier (connecting/ringing states)
- Add CAMERA service type for video calls (Android 14+)
- Proactive service start on background transition
- Media controls in notification (mute, speaker, end call)
- Status bar and system drawer indicators
- Dynamic notification updates based on call state"

echo ""
echo "✅ Update pushed successfully!"
echo ""
echo "Users on runtime version 1.0.11 will receive this update automatically."

