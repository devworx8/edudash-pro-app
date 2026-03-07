#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="$ROOT_DIR/.git/hooks"
HOOK_FILE="$HOOKS_DIR/pre-commit"

if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "[hooks:install] .git/hooks not found. Run this from a git repository."
  exit 1
fi

printf '%s\n' '#!/usr/bin/env bash' > "$HOOK_FILE"
printf '%s\n' 'set -euo pipefail' >> "$HOOK_FILE"
printf '%s\n' 'repo_root="$(git rev-parse --show-toplevel)"' >> "$HOOK_FILE"
printf '%s\n' 'cd "$repo_root"' >> "$HOOK_FILE"
printf '%s\n' 'bash scripts/pre-commit-secrets.sh' >> "$HOOK_FILE"

chmod +x "$HOOK_FILE"

echo "[hooks:install] Installed pre-commit hook at $HOOK_FILE"
echo "[hooks:install] The hook blocks commits if secret patterns are detected."
