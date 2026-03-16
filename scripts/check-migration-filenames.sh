#!/usr/bin/env bash
# check-migration-filenames.sh
# Enforces the Supabase migration filename pattern:
#   YYYYMMDDHHMMSS_<snake_case_description>.sql
# Used by .github/workflows/db-lint.yml

set -euo pipefail

PATTERN='^[0-9]{14}_[a-z0-9_]+\.sql$'
EXIT_CODE=0

for dir in migrations supabase/migrations; do
  [ -d "$dir" ] || continue
  for f in "$dir"/*.sql; do
    [ -f "$f" ] || continue
    basename=$(basename "$f")
    if ! [[ "$basename" =~ $PATTERN ]]; then
      echo "ERROR: Invalid migration filename: $f"
      echo "  Expected pattern: YYYYMMDDHHMMSS_snake_case_description.sql"
      EXIT_CODE=1
    fi
  done
done

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "All migration filenames match the required pattern."
fi

exit "$EXIT_CODE"
