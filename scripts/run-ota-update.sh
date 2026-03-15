#!/bin/bash
# Helper script to run OTA update with proper Node.js/npm setup

# Load nvm if it exists
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
fi

# Use Node.js version from .nvmrc if it exists
if [ -f .nvmrc ]; then
    NODE_VERSION=$(cat .nvmrc | tr -d '\n')
    echo "Using Node.js version from .nvmrc: $NODE_VERSION"
    nvm use "$NODE_VERSION" 2>/dev/null || nvm install "$NODE_VERSION"
fi

# Check if node and npm are available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH"
    echo "Please install Node.js 20.x using one of these methods:"
    echo "1. Install nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash"
    echo "2. Install Node.js directly: sudo apt install nodejs npm"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed or not in PATH"
    exit 1
fi

echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo ""
echo "Running OTA update..."
echo ""

# Run the OTA update command
npm run ota:playstore -- --message "Fix payments updates, invite flow, and auth freezing"
