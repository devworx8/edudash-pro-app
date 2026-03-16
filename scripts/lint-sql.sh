#!/bin/bash

# Database SQL Linting Script
# Uses SQLFluff to lint PostgreSQL/Supabase SQL files

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 EduDashPro Database SQL Linter${NC}"
echo "=================================================="

# Default action
ACTION=${1:-lint}
TARGET=${2:-"supabase/migrations/"}

case $ACTION in
    "lint"|"check")
        echo -e "${YELLOW}📋 Linting SQL files...${NC}"
        sqlfluff lint $TARGET --verbose
        ;;
    "fix"|"format")
        echo -e "${YELLOW}🔧 Formatting SQL files...${NC}"
        sqlfluff format $TARGET --nocolor --dialect postgres
        echo -e "${GREEN}✅ SQL files formatted${NC}"
        ;;
    "rules")
        echo -e "${YELLOW}📚 Available SQLFluff rules:${NC}"
        sqlfluff rules
        ;;
    "config")
        echo -e "${YELLOW}⚙️  Current SQLFluff configuration:${NC}"
        sqlfluff config
        ;;
    "help"|"-h"|"--help")
        echo "Usage: ./lint-sql.sh [ACTION] [TARGET]"
        echo ""
        echo "Actions:"
        echo "  lint    - Lint SQL files (default)"
        echo "  fix     - Auto-fix SQL formatting issues"
        echo "  rules   - Show available linting rules"
        echo "  config  - Show current configuration"
        echo "  help    - Show this help message"
        echo ""
        echo "Target:"
        echo "  Specify files or directories to lint"
        echo "  Default: 'db/ migrations/ *.sql'"
        echo ""
        echo "Examples:"
        echo "  ./lint-sql.sh lint db/"
        echo "  ./lint-sql.sh fix migrations/"
        echo "  ./lint-sql.sh lint db/20250916_push_devices.sql"
        ;;
    *)
        echo -e "${RED}❌ Unknown action: $ACTION${NC}"
        echo "Use './lint-sql.sh help' for usage information"
        exit 1
        ;;
esac