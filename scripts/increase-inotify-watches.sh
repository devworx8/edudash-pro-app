#!/usr/bin/env bash
# Increase inotify max_user_watches so Metro/Expo can watch all project files.
# Run: bash scripts/increase-inotify-watches.sh   (will prompt for sudo)

set -e
CURRENT=$(cat /proc/sys/fs/inotify/max_user_watches 2>/dev/null || echo "0")
TARGET=524288

if [ "$CURRENT" -ge "$TARGET" ] 2>/dev/null; then
  echo "Current limit ($CURRENT) is already >= $TARGET. No change needed."
  exit 0
fi

echo "Current fs.inotify.max_user_watches: $CURRENT"
echo "Setting to $TARGET (requires sudo)..."

sudo sysctl fs.inotify.max_user_watches=$TARGET

if grep -q 'fs.inotify.max_user_watches' /etc/sysctl.conf 2>/dev/null; then
  echo "Already in /etc/sysctl.conf; skipping persist step."
else
  echo "Making persistent: adding to /etc/sysctl.conf"
  echo "fs.inotify.max_user_watches=$TARGET" | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p 2>/dev/null || true
fi

echo "Done. New limit: $(cat /proc/sys/fs/inotify/max_user_watches). You can restart Metro/Expo now."
