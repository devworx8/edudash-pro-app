#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[pre-commit] Secret scan started..."

# First run the repository-level baseline checks.
bash scripts/check-firebase-secrets.sh

# Then scan staged diff lines so newly added secrets are blocked immediately.
STAGED_DIFF="$(git diff --cached --unified=0 --no-color || true)"
if [[ -z "$STAGED_DIFF" ]]; then
  echo "[pre-commit] No staged changes."
  exit 0
fi

if command -v gitleaks >/dev/null 2>&1; then
  echo "[pre-commit] Running gitleaks protect --staged..."
  gitleaks protect --staged --redact --config .gitleaks.toml
  echo "[pre-commit] gitleaks check passed."
  exit 0
fi

echo "[pre-commit] gitleaks is not installed; running fallback staged secret scan."

ADDED_LINES="$(printf '%s\n' "$STAGED_DIFF" | rg '^\+[^+]' || true)"
if [[ -z "$ADDED_LINES" ]]; then
  echo "[pre-commit] No added lines to scan."
  exit 0
fi

BLOCKED_PATTERN='(SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*eyJ|SERVER_SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*eyJ|OPENAI_API_KEY\s*[:=]\s*sk-|ANTHROPIC_API_KEY\s*[:=]\s*[A-Za-z0-9_-]{20,}|SENTRY_AUTH_TOKEN\s*[:=]\s*sntrys_|PAYFAST_(MERCHANT_KEY|PASSPHRASE)\s*[:=]\s*[^[:space:]]+|EXPO_ACCESS_TOKEN\s*[:=]\s*[A-Za-z0-9_-]{20,}|GOOGLE_CLIENT_SECRET\s*[:=]\s*[^[:space:]]+)'

MATCHES="$(printf '%s\n' "$ADDED_LINES" | rg -n "$BLOCKED_PATTERN" || true)"
if [[ -n "$MATCHES" ]]; then
  echo ""
  echo "[pre-commit] ERROR: Potential secret(s) found in staged changes:"
  echo "$MATCHES"
  echo ""
  echo "Commit blocked. Remove secrets and use local/EAS/GitHub secret stores."
  echo "Tip: install gitleaks for full scanning: https://github.com/gitleaks/gitleaks"
  exit 1
fi

echo "[pre-commit] Fallback secret scan passed."
