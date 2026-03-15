#!/bin/bash
# Development startup script for EduDash Pro
# Ensures correct Node version and starts the Expo development server

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Use Node 20 (specified in .nvmrc)
nvm use

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install --legacy-peer-deps
fi

# Start the development server
echo "🚀 Starting EduDash Pro development server..."
npm start
