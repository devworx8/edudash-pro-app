#!/bin/bash
# filepath: /media/king/5e026cdc-594e-4493-bf92-c35c231beea3/home/king/Desktop/dashpro/scripts/switch-expo-project.sh

# ============================================================
# EAS/Expo Project Switcher for EduDash Pro
# ============================================================
# Switches between the 3 Expo projects on expo.dev:
#
# 1. com.edudashpro.app (Dash-T's Organization) - MAIN PLAY STORE
#    Owner: dash-ts-organization
#    Slug: comedudashproapp  
#    Project ID: 7f8f6d60-a127-4cbc-ad34-c9d617aa2880
#
# 2. edudashpro (Dash-Pro account) - LEGACY
#    Owner: dash-pro
#    Slug: edudashpro
#    Project ID: ab7c9230-2f47-4bfa-b4f4-4ae516a334bc
#
# 3. edudashpro_play_store (Dash-T's Organization) - ALTERNATE
#    Owner: dash-ts-organization  
#    Slug: edudashpro-play-store
#    Project ID: (to be determined)
#
# Usage: ./scripts/switch-expo-project.sh [main|legacy|alt|status]
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================
# PROJECT CONFIGURATIONS
# ============================================================

# Project 1: MAIN (com.edudashpro.app) - Active Play Store
MAIN_OWNER="dash-ts-organization"
MAIN_SLUG="comedudashproapp"
MAIN_PROJECT_ID="ae5db83e-e6fb-4a32-9973-e3ed5f8047ce"
MAIN_PACKAGE="com.edudashpro.app"
MAIN_UPDATE_URL="https://u.expo.dev/ae5db83e-e6fb-4a32-9973-e3ed5f8047ce"

# Project 2: LEGACY (edudashpro on Dash-Pro account)
LEGACY_OWNER="dash-pro"
LEGACY_SLUG="edudashpro"
LEGACY_PROJECT_ID="ab7c9230-2f47-4bfa-b4f4-4ae516a334bc"
LEGACY_PACKAGE="com.edudashproapp"
LEGACY_UPDATE_URL="https://u.expo.dev/ab7c9230-2f47-4bfa-b4f4-4ae516a334bc"

# Project 3: ALTERNATE (edudashpro_play_store)
ALT_OWNER="dash-ts-organization"
ALT_SLUG="edudashpro-play-store"
ALT_PROJECT_ID="ae5db83e-e6fb-4a32-9973-e3ed5f8047ce"
ALT_PACKAGE="com.edudashpro.app"
ALT_UPDATE_URL="https://u.expo.dev/ae5db83e-e6fb-4a32-9973-e3ed5f8047ce"

# Project 4: MARK1 (edudashpro account - com.edudashpro.app)
MARK1_OWNER="edudashpro"
MARK1_SLUG="edudashpro"
MARK1_PROJECT_ID="253b1057-8489-44cf-b0e3-c3c10319a298"
MARK1_PACKAGE="com.edudashpro.app"
MARK1_UPDATE_URL="https://u.expo.dev/253b1057-8489-44cf-b0e3-c3c10319a298"

# Project 5: K1NG (k1ng-devops project)
K1NG_OWNER="k1ng-devops"
K1NG_SLUG="edudashpro"
K1NG_PROJECT_ID="81051af4-2468-4efa-a1f1-03d00f5c5688"
K1NG_PACKAGE="com.edudashpro.app"
K1NG_UPDATE_URL="https://u.expo.dev/81051af4-2468-4efa-a1f1-03d00f5c5688"

# ============================================================
# HELPER FUNCTIONS
# ============================================================

show_header() {
    echo ""
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}       EduDash Pro - EAS Project Switcher${NC}"
    echo -e "${CYAN}============================================================${NC}"
    echo ""
}

show_current() {
    show_header
    
    CURRENT_OWNER=$(jq -r '.expo.owner // "unknown"' app.json)
    CURRENT_SLUG=$(jq -r '.expo.slug // "unknown"' app.json)
    CURRENT_PROJECT_ID=$(jq -r '.expo.extra.eas.projectId // "not set"' app.json)
    CURRENT_VERSION=$(jq -r '.expo.version // "unknown"' app.json)
    CURRENT_PACKAGE=$(jq -r '.expo.android.package // "unknown"' app.json)
    
    echo -e "${YELLOW}Current Configuration:${NC}"
    echo "  Owner:      $CURRENT_OWNER"
    echo "  Slug:       $CURRENT_SLUG"
    echo "  Project ID: $CURRENT_PROJECT_ID"
    echo "  Version:    $CURRENT_VERSION"
    echo "  Package:    $CURRENT_PACKAGE"
    echo ""
    
    # Determine which project this is
    if [ "$CURRENT_OWNER" = "$MAIN_OWNER" ] && [ "$CURRENT_SLUG" = "$MAIN_SLUG" ]; then
        echo -e "${GREEN}✓ Active Project: MAIN (com.edudashpro.app)${NC}"
        echo "  → This is the main Play Store project"
        echo "  → OTA updates go to production users"
    elif [ "$CURRENT_OWNER" = "$LEGACY_OWNER" ] && [ "$CURRENT_SLUG" = "$LEGACY_SLUG" ]; then
        echo -e "${YELLOW}⚠ Active Project: LEGACY (dash-pro/edudashpro)${NC}"
        echo "  → This is the old project"
        echo "  → Only use for legacy OTA updates"
    elif [ "$CURRENT_OWNER" = "$ALT_OWNER" ] && [ "$CURRENT_SLUG" = "$ALT_SLUG" ]; then
        echo -e "${BLUE}◉ Active Project: ALTERNATE (edudashpro_play_store)${NC}"
        echo "  → This is an alternate project"
    else
        echo -e "${RED}✗ Unknown project configuration${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Available Projects:${NC}"
    echo "  1. main   - com.edudashpro.app (Dash-T's Organization) [PLAY STORE]"
    echo "  2. legacy - edudashpro (Dash-Pro) [OLD]"
    echo "  3. alt    - edudashpro_play_store (Dash-T's Organization)"
    echo ""
}

switch_to_main() {
    show_header
    echo -e "${GREEN}Switching to MAIN project (com.edudashpro.app)...${NC}"
    echo ""
    
    # Create backup
    cp app.json app.json.backup
    
    # Update app.json
    jq --arg owner "$MAIN_OWNER" \
       --arg slug "$MAIN_SLUG" \
       --arg projectId "$MAIN_PROJECT_ID" \
       --arg package "$MAIN_PACKAGE" \
       --arg updateUrl "$MAIN_UPDATE_URL" \
       '.expo.owner = $owner | 
        .expo.slug = $slug | 
        .expo.extra.eas.projectId = $projectId |
        .expo.android.package = $package |
        .expo.updates.url = $updateUrl' app.json > app.json.tmp
    mv app.json.tmp app.json
    
    echo -e "${GREEN}✓ Switched to MAIN project${NC}"
    echo ""
    echo "  Owner:      $MAIN_OWNER"
    echo "  Slug:       $MAIN_SLUG"
    echo "  Project ID: $MAIN_PROJECT_ID"
    echo "  Package:    $MAIN_PACKAGE"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  • Build:  eas build --platform android --profile production"
    echo "  • OTA:    eas update --channel production --message \"Your message\""
    echo ""
}

switch_to_legacy() {
    show_header
    echo -e "${YELLOW}Switching to LEGACY project (dash-pro/edudashpro)...${NC}"
    echo ""
    
    # Create backup
    cp app.json app.json.backup
    
    # Update app.json
    jq --arg owner "$LEGACY_OWNER" \
       --arg slug "$LEGACY_SLUG" \
       --arg projectId "$LEGACY_PROJECT_ID" \
       --arg package "$LEGACY_PACKAGE" \
       --arg updateUrl "$LEGACY_UPDATE_URL" \
       '.expo.owner = $owner | 
        .expo.slug = $slug | 
        .expo.extra.eas.projectId = $projectId |
        .expo.android.package = $package |
        .expo.updates.url = $updateUrl' app.json > app.json.tmp
    mv app.json.tmp app.json
    
    echo -e "${GREEN}✓ Switched to LEGACY project${NC}"
    echo ""
    echo "  Owner:      $LEGACY_OWNER"
    echo "  Slug:       $LEGACY_SLUG"
    echo "  Project ID: $LEGACY_PROJECT_ID"
    echo "  Package:    $LEGACY_PACKAGE"
    echo ""
    echo -e "${RED}⚠ WARNING: This is the legacy project!${NC}"
    echo "  Only use this for OTA updates to very old app versions."
    echo ""
}

switch_to_alt() {
    show_header
    echo -e "${BLUE}Switching to ALTERNATE project (edudashpro_play_store)...${NC}"
    echo ""
    
    if [ -z "$ALT_PROJECT_ID" ]; then
        echo -e "${RED}✗ Error: ALT_PROJECT_ID not set${NC}"
        echo "  Please update this script with the project ID first."
        echo "  You can find it on expo.dev in the project settings."
        exit 1
    fi
    
    # Create backup
    cp app.json app.json.backup
    
    # Update app.json
    jq --arg owner "$ALT_OWNER" \
       --arg slug "$ALT_SLUG" \
       --arg projectId "$ALT_PROJECT_ID" \
       --arg package "$ALT_PACKAGE" \
       --arg updateUrl "$ALT_UPDATE_URL" \
       '.expo.owner = $owner | 
        .expo.slug = $slug | 
        .expo.extra.eas.projectId = $projectId |
        .expo.android.package = $package |
        .expo.updates.url = $updateUrl' app.json > app.json.tmp
    mv app.json.tmp app.json
    
    echo -e "${GREEN}✓ Switched to ALTERNATE project${NC}"
    echo ""
    echo "  Owner:      $ALT_OWNER"
    echo "  Slug:       $ALT_SLUG"
    echo "  Project ID: $ALT_PROJECT_ID"
    echo ""
}

switch_to_mark1() {
    show_header
    echo -e "${CYAN}Switching to MARK1 project (mark-1)...${NC}"
    echo ""
    
    # Create backup
    cp app.json app.json.backup
    
    # Update app.json
    jq --arg owner "$MARK1_OWNER" \
       --arg slug "$MARK1_SLUG" \
       --arg projectId "$MARK1_PROJECT_ID" \
       --arg package "$MARK1_PACKAGE" \
       --arg updateUrl "$MARK1_UPDATE_URL" \
       '.expo.owner = $owner | 
        .expo.slug = $slug | 
        .expo.extra.eas.projectId = $projectId |
        .expo.android.package = $package |
        .expo.updates.url = $updateUrl' app.json > app.json.tmp
    mv app.json.tmp app.json
    
    echo -e "${GREEN}✓ Switched to MARK1 project${NC}"
    echo ""
    echo "  Owner:      $MARK1_OWNER"
    echo "  Slug:       $MARK1_SLUG"
    echo "  Project ID: $MARK1_PROJECT_ID"
    echo ""
}

switch_to_k1ng() {
    show_header
    echo -e "${CYAN}Switching to K1NG project (k1ng-devops/edudashpro)...${NC}"
    echo ""
    
    # Create backup
    cp app.json app.json.backup
    
    # Update app.json
    jq --arg owner "$K1NG_OWNER" \
       --arg slug "$K1NG_SLUG" \
       --arg projectId "$K1NG_PROJECT_ID" \
       --arg package "$K1NG_PACKAGE" \
       --arg updateUrl "$K1NG_UPDATE_URL" \
       '.expo.owner = $owner | 
        .expo.slug = $slug | 
        .expo.extra.eas.projectId = $projectId |
        .expo.android.package = $package |
        .expo.updates.url = $updateUrl' app.json > app.json.tmp
    mv app.json.tmp app.json
    
    echo -e "${GREEN}✓ Switched to K1NG project${NC}"
    echo ""
    echo "  Owner:      $K1NG_OWNER"
    echo "  Slug:       $K1NG_SLUG"
    echo "  Project ID: $K1NG_PROJECT_ID"
    echo ""
}

build_production() {
    show_header
    echo -e "${GREEN}Starting production build for Play Store...${NC}"
    echo ""
    
    # Show current config
    CURRENT_OWNER=$(jq -r '.expo.owner' app.json)
    CURRENT_SLUG=$(jq -r '.expo.slug' app.json)
    CURRENT_VERSION=$(jq -r '.expo.version' app.json)
    
    echo "Building with:"
    echo "  Owner:   $CURRENT_OWNER"
    echo "  Slug:    $CURRENT_SLUG"
    echo "  Version: $CURRENT_VERSION"
    echo ""
    
    read -p "Continue with build? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        eas build --platform android --profile production --non-interactive
    fi
}

bump_version() {
    show_header
    
    CURRENT_VERSION=$(jq -r '.expo.version' app.json)
    CURRENT_BUILD=$(jq -r '.expo.android.versionCode' app.json)
    
    # Parse version
    IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
    NEW_PATCH=$((PATCH + 1))
    NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
    NEW_BUILD=$((CURRENT_BUILD + 1))
    
    echo "Current: v$CURRENT_VERSION (build $CURRENT_BUILD)"
    echo "New:     v$NEW_VERSION (build $NEW_BUILD)"
    echo ""
    
    read -p "Bump version? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        jq --arg version "$NEW_VERSION" \
           --argjson build "$NEW_BUILD" \
           '.expo.version = $version | .expo.android.versionCode = $build' app.json > app.json.tmp
        mv app.json.tmp app.json
        echo -e "${GREEN}✓ Version bumped to $NEW_VERSION (build $NEW_BUILD)${NC}"
    fi
}

# ============================================================
# MAIN SCRIPT
# ============================================================

case "${1:-status}" in
    main|1|playstore|production)
        switch_to_main
        ;;
    legacy|2|old|dashpro)
        switch_to_legacy
        ;;
    alt|3|alternate)
        switch_to_alt
        ;;
    mark1|4|m1)
        switch_to_mark1
        ;;
    k1ng|5|king)
        switch_to_k1ng
        ;;
    build)
        build_production
        ;;
    bump)
        bump_version
        ;;
    status|"")
        show_current
        ;;
    help|--help|-h)
        show_header
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  main, 1, playstore    Switch to MAIN project (com.edudashpro.app)"
        echo "  legacy, 2, old        Switch to LEGACY project (dash-pro/edudashpro)"
        echo "  alt, 3, alternate     Switch to ALTERNATE project"
        echo "  mark1, 4, m1          Switch to MARK1 project"
        echo "  k1ng, 5, king         Switch to K1NG project (k1ng-devops)"
        echo "  build                 Start production build"
        echo "  bump                  Bump version number"
        echo "  status                Show current project (default)"
        echo "  help                  Show this help"
        echo ""
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo "Run '$0 help' for usage information."
        exit 1
        ;;
esac
