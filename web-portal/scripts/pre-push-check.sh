#!/bin/bash
# Pre-push build verification script
# Run this before pushing to ensure code builds successfully

set -e  # Exit on any error

echo "🔍 Running pre-push checks..."
echo ""

# Check if we're in the web directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must run from web directory"
  exit 1
fi

# 1. TypeScript type check
echo "📝 Running TypeScript type check..."
npm run typecheck
echo "✅ TypeScript passed"
echo ""

# 2. ESLint check
echo "🔍 Running ESLint..."
npm run lint
echo "✅ Linting passed"
echo ""

# 3. Build check
echo "🏗️  Running production build..."
npm run build
echo "✅ Build passed"
echo ""

echo "✨ All pre-push checks passed! Safe to push."
echo ""
