#!/bin/bash
# ============================================================================
# EduDash Pro - Development Environment Setup
# ============================================================================
# This script sets up the complete development environment including:
# - Node.js via nvm
# - npm dependencies
# - EAS CLI
# - Supabase CLI
# - Environment PATH configuration
# ============================================================================

set -e

echo "🚀 Setting up EduDash Pro Development Environment..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Step 1: Install nvm (Node Version Manager)
# ============================================================================
echo -e "${BLUE}📦 Step 1: Installing nvm...${NC}"

if [ -d "$HOME/.nvm" ]; then
  echo -e "${GREEN}✅ nvm already installed${NC}"
else
  echo "Downloading and installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  echo -e "${GREEN}✅ nvm installed${NC}"
fi

# Load nvm into current shell
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

echo ""

# ============================================================================
# Step 2: Add nvm to PATH permanently
# ============================================================================
echo -e "${BLUE}📝 Step 2: Adding nvm to PATH...${NC}"

# Detect shell configuration file
if [ -n "$ZSH_VERSION" ]; then
  SHELL_CONFIG="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
  if [ -f "$HOME/.bashrc" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
  else
    SHELL_CONFIG="$HOME/.bash_profile"
  fi
else
  SHELL_CONFIG="$HOME/.profile"
fi

# Check if nvm is already in the config
if grep -q "NVM_DIR" "$SHELL_CONFIG" 2>/dev/null; then
  echo -e "${GREEN}✅ nvm already in $SHELL_CONFIG${NC}"
else
  echo "Adding nvm to $SHELL_CONFIG..."
  cat >> "$SHELL_CONFIG" << 'EOL'

# ============================================================================
# nvm (Node Version Manager)
# ============================================================================
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
EOL
  echo -e "${GREEN}✅ nvm added to $SHELL_CONFIG${NC}"
fi

echo ""

# ============================================================================
# Step 3: Install Node.js 20
# ============================================================================
echo -e "${BLUE}📦 Step 3: Installing Node.js 20...${NC}"

if command -v node &> /dev/null; then
  CURRENT_NODE_VERSION=$(node -v)
  echo "Current Node.js version: $CURRENT_NODE_VERSION"
fi

nvm install 20
nvm use 20
nvm alias default 20

echo -e "${GREEN}✅ Node.js $(node -v) installed and set as default${NC}"
echo -e "${GREEN}✅ npm $(npm -v) available${NC}"
echo ""

# ============================================================================
# Step 4: Install Global npm Packages
# ============================================================================
echo -e "${BLUE}📦 Step 4: Installing global npm packages...${NC}"

# Install EAS CLI for Expo app builds and OTA updates
if command -v eas &> /dev/null; then
  echo -e "${GREEN}✅ eas-cli already installed ($(eas --version))${NC}"
else
  echo "Installing eas-cli..."
  npm install -g eas-cli
  echo -e "${GREEN}✅ eas-cli installed${NC}"
fi

# Install Expo CLI (optional but useful)
if command -v expo &> /dev/null; then
  echo -e "${GREEN}✅ expo-cli already installed${NC}"
else
  echo "Installing expo-cli..."
  npm install -g expo-cli
  echo -e "${GREEN}✅ expo-cli installed${NC}"
fi

echo ""

# ============================================================================
# Step 5: Install Supabase CLI
# ============================================================================
echo -e "${BLUE}📦 Step 5: Installing Supabase CLI...${NC}"

if command -v supabase &> /dev/null; then
  echo -e "${GREEN}✅ Supabase CLI already installed ($(supabase --version))${NC}"
else
  echo "Installing Supabase CLI..."
  
  # Download and install
  curl -L https://supabase.com/download/cli/install.sh | sh
  
  # Add to PATH if not already there
  if ! grep -q "/usr/local/bin" "$SHELL_CONFIG" 2>/dev/null; then
    echo 'export PATH="/usr/local/bin:$PATH"' >> "$SHELL_CONFIG"
  fi
  
  # Add to current session
  export PATH="/usr/local/bin:$PATH"
  
  echo -e "${GREEN}✅ Supabase CLI installed${NC}"
fi

echo ""

# ============================================================================
# Step 6: Install Project Dependencies
# ============================================================================
echo -e "${BLUE}📦 Step 6: Installing project dependencies...${NC}"

if [ -f "package.json" ]; then
  echo "Installing npm packages..."
  npm install
  echo -e "${GREEN}✅ Project dependencies installed${NC}"
else
  echo -e "${YELLOW}⚠️  package.json not found in current directory${NC}"
fi

echo ""

# ============================================================================
# Step 7: Create Helper Aliases
# ============================================================================
echo -e "${BLUE}📝 Step 7: Creating helper aliases...${NC}"

# Check if aliases already exist
if grep -q "# EduDash Pro Aliases" "$SHELL_CONFIG" 2>/dev/null; then
  echo -e "${GREEN}✅ Aliases already configured${NC}"
else
  cat >> "$SHELL_CONFIG" << 'EOL'

# ============================================================================
# EduDash Pro Aliases
# ============================================================================
alias dashpro-start="cd ~/Desktop/dashpro && source ~/.nvm/nvm.sh && nvm use 20 && npm start"
alias dashpro-ota="cd ~/Desktop/dashpro && source ~/.nvm/nvm.sh && nvm use 20 && npm run ota:playstore"
alias dashpro-build="cd ~/Desktop/dashpro && source ~/.nvm/nvm.sh && nvm use 20 && npm run build:android:aab"
alias dashpro-test="cd ~/Desktop/dashpro && source ~/.nvm/nvm.sh && nvm use 20 && npm test"
alias dashpro-typecheck="cd ~/Desktop/dashpro && source ~/.nvm/nvm.sh && nvm use 20 && npm run typecheck"
alias dashpro-lint="cd ~/Desktop/dashpro && source ~/.nvm/nvm.sh && nvm use 20 && npm run lint"
EOL
  echo -e "${GREEN}✅ Helper aliases added to $SHELL_CONFIG${NC}"
fi

echo ""

# ============================================================================
# Step 8: Verify Installation
# ============================================================================
echo -e "${BLUE}🔍 Step 8: Verifying installation...${NC}"
echo ""

echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"
echo "nvm: $(nvm --version)"
echo "EAS CLI: $(eas --version 2>/dev/null || echo 'Not installed')"
echo "Expo CLI: $(expo --version 2>/dev/null || echo 'Not installed')"
echo "Supabase CLI: $(supabase --version 2>/dev/null || echo 'Not installed')"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Development Environment Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo ""
echo "1. Reload your shell configuration:"
echo -e "   ${BLUE}source $SHELL_CONFIG${NC}"
echo ""
echo "2. Or open a new terminal window"
echo ""
echo "3. Navigate to your project:"
echo -e "   ${BLUE}cd ~/Desktop/dashpro${NC}"
echo ""
echo "4. Use helper aliases:"
echo -e "   ${BLUE}dashpro-start${NC}    - Start development server"
echo -e "   ${BLUE}dashpro-ota${NC}      - Push OTA update"
echo -e "   ${BLUE}dashpro-build${NC}    - Build production AAB"
echo -e "   ${BLUE}dashpro-test${NC}     - Run tests"
echo ""
echo "5. Login to required services:"
echo -e "   ${BLUE}eas login${NC}        - Login to Expo EAS"
echo -e "   ${BLUE}supabase login${NC}   - Login to Supabase (requires access token)"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
