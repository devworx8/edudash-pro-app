#!/bin/bash

# EAS Project Switcher
# Usage: ./scripts/switch-eas-project.sh [new|old]

set -e

# Project configurations
OLD_PROJECT_OWNER="dashpro"
OLD_PROJECT_SLUG="edudashpro"
OLD_PROJECT_ID="ab7c9230-2f47-4bfa-b4f4-4ae516a334bc"

NEW_PROJECT_OWNER="dash-ts-organization"
NEW_PROJECT_SLUG="comedudashproapp"
NEW_PROJECT_ID="ae5db83e-e6fb-4a32-9973-e3ed5f8047ce"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_current() {
    CURRENT_OWNER=$(jq -r '.expo.owner' app.json)
    CURRENT_SLUG=$(jq -r '.expo.slug' app.json)
    
    if [ "$CURRENT_OWNER" = "$OLD_PROJECT_OWNER" ]; then
        echo -e "${YELLOW}Current project: OLD (dashpro/edudashpro)${NC}"
        echo "  → OTA updates go to Mark_1 (1.0.2) users"
    else
        echo -e "${GREEN}Current project: NEW (dash-ts-organization/comedudashproapp)${NC}"
        echo "  → OTA updates go to Release 8+ users"
    fi
}

switch_to_old() {
    echo "Switching to OLD project (dashpro/edudashpro)..."
    
    # Update app.json - owner, slug, and remove projectId (let EAS resolve it)
    jq '.expo.owner = "dashpro" | .expo.slug = "edudashpro" | del(.expo.extra.eas.projectId)' app.json > app.json.tmp
    mv app.json.tmp app.json
    
    # Update updates URL to old project format
    jq '.expo.updates.url = "https://u.expo.dev/@dashpro/edudashpro"' app.json > app.json.tmp
    mv app.json.tmp app.json
    
    echo -e "${GREEN}✓ Switched to OLD project${NC}"
    echo "  Owner: dashpro"
    echo "  Slug: edudashpro"
    echo ""
    echo "Now run: eas update --channel production --message \"Your message\""
}

switch_to_new() {
    echo "Switching to NEW project (dash-ts-organization/comedudashproapp)..."
    
    # Update app.json - owner, slug, and set projectId
    jq '.expo.owner = "dash-ts-organization" | .expo.slug = "comedudashproapp" | .expo.extra.eas.projectId = "ae5db83e-e6fb-4a32-9973-e3ed5f8047ce"' app.json > app.json.tmp
    mv app.json.tmp app.json
    
    # Update updates URL with project ID
    jq '.expo.updates.url = "https://u.expo.dev/ae5db83e-e6fb-4a32-9973-e3ed5f8047ce"' app.json > app.json.tmp
    mv app.json.tmp app.json
    
    echo -e "${GREEN}✓ Switched to NEW project${NC}"
    echo "  Owner: dash-ts-organization"
    echo "  Slug: comedudashproapp"
    echo ""
    echo "Now run: eas update --channel production --message \"Your message\""
}

case "$1" in
    old|legacy|mark1)
        switch_to_old
        ;;
    new|current|release8)
        switch_to_new
        ;;
    status|"")
        show_current
        ;;
    *)
        echo "Usage: $0 [old|new|status]"
        echo ""
        echo "  old     - Switch to OLD project (dashpro/edudashpro) for Mark_1 OTA"
        echo "  new     - Switch to NEW project (dash-ts-organization) for Release 8+ OTA"
        echo "  status  - Show current project (default)"
        exit 1
        ;;
esac
