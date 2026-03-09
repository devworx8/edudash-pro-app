#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[check-firebase-secrets] Checking tracked files for blocked secret artifacts..."

TRACKED_FILES="$(git ls-files)"
FAILED=0

check_pattern() {
  local pattern="$1"
  local label="$2"
  local matches
  matches="$(printf '%s\n' "$TRACKED_FILES" | rg -n --no-heading "$pattern" || true)"
  if [[ -n "$matches" ]]; then
    echo "[check-firebase-secrets] ERROR: blocked $label detected:"
    echo "$matches"
    echo ""
    FAILED=1
  fi
}

check_pattern '(^|/)(google-services\.json|GoogleService-Info\.plist)$' 'firebase config file'
check_pattern '(^|/)components/\.env$' 'nested env file'
check_pattern '(^|/)credentials-backup/KEYSTORE_CREDENTIALS\.txt$' 'keystore credential file'
check_pattern '(\.bak|\.old|\.orig|\.rej|\.swp)$' 'backup artifact'

ENV_MATCHES="$(printf '%s\n' "$TRACKED_FILES" | rg --no-heading '(^|/)\.env(\..*)?$' | rg -v '(^|/)\.env\.example$' || true)"
if [[ -n "$ENV_MATCHES" ]]; then
  echo "[check-firebase-secrets] ERROR: tracked env file detected:"
  echo "$ENV_MATCHES" | nl -ba
  echo ""
  FAILED=1
fi

echo "[check-firebase-secrets] Scanning tracked files for high-risk secret patterns..."
KEY_MATCHES="$(
  while IFS= read -r -d '' file; do
    [[ -f "$file" ]] || continue
    rg -n --no-heading \
      -e 'AIza[0-9A-Za-z_-]{35}' \
      -e 'EXPO_ACCESS_TOKEN\s*=\s*[A-Za-z0-9_\-]{20,}' \
      -e 'SUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ[A-Za-z0-9._-]{50,}' \
      "$file" || true
  done < <(git ls-files -z)
)"

if [[ -n "$KEY_MATCHES" ]]; then
  echo "[check-firebase-secrets] ERROR: potential secret material detected:"
  echo "$KEY_MATCHES"
  echo ""
  FAILED=1
fi

if [[ "$FAILED" -ne 0 ]]; then
  echo "[check-firebase-secrets] FAIL"
  echo "Move secrets to EAS/GitHub secrets and keep only placeholders in repo."
  exit 1
fi

echo "[check-firebase-secrets] OK"
