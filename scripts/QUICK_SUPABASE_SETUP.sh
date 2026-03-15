#!/bin/bash

# Quick Supabase CLI Setup Script
# Run this in your terminal (requires sudo for apt installation)

set -e

echo "🚀 Installing Supabase CLI..."
echo ""

# Check if already installed
if command -v supabase &> /dev/null; then
    echo "✅ Supabase CLI already installed!"
    supabase --version
    exit 0
fi

echo "Select installation method:"
echo "1) APT Repository (Recommended for Ubuntu/Debian)"
echo "2) Use npx with Node.js 20 (no sudo needed)"
echo "3) Download binary manually"
echo ""
read -p "Enter choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "📦 Installing via APT repository..."
        curl -fsS https://download.supabase.com/linux/apt/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/supabase-archive-keyring.gpg
        echo "deb [arch=amd64 signed-by=/usr/share/keyrings/supabase-archive-keyring.gpg] https://download.supabase.com/linux/apt stable main" | sudo tee /etc/apt/sources.list.d/supabase.list > /dev/null
        sudo apt-get update
        sudo apt-get install supabase -y
        echo "✅ Installation complete!"
        supabase --version
        ;;
    2)
        echo ""
        echo "📦 Setting up Node.js 20 via nvm..."
        if ! command -v nvm &> /dev/null; then
            echo "❌ nvm not found. Please install nvm first or use method 1"
            exit 1
        fi
        
        # Check if Node 20 is installed
        if ! nvm list 20 &> /dev/null; then
            echo "Installing Node.js 20..."
            nvm install 20
        fi
        
        nvm use 20
        echo "✅ Node.js 20 activated"
        echo ""
        echo "You can now use Supabase CLI with:"
        echo "  npx supabase login"
        echo "  npx supabase link --project-ref lvvvjywrmpcqrpvuptdi"
        echo "  npx supabase secrets set PAYFAST_MODE=production"
        ;;
    3)
        echo ""
        echo "📥 Downloading Supabase binary..."
        LATEST_VERSION=$(curl -s https://api.github.com/repos/supabase/cli/releases/latest | grep tag_name | cut -d '"' -f 4)
        echo "Latest version: $LATEST_VERSION"
        
        DOWNLOAD_URL="https://github.com/supabase/cli/releases/download/${LATEST_VERSION}/supabase_linux_amd64"
        
        wget "$DOWNLOAD_URL" -O /tmp/supabase
        chmod +x /tmp/supabase
        
        echo ""
        read -p "Install to /usr/local/bin? (requires sudo) [y/n]: " install_bin
        if [[ $install_bin =~ ^[Yy]$ ]]; then
            sudo mv /tmp/supabase /usr/local/bin/
            echo "✅ Installed to /usr/local/bin/supabase"
            supabase --version
        else
            echo "✅ Downloaded to /tmp/supabase"
            echo "You can run it with: /tmp/supabase --version"
            echo "Or move it to your PATH manually"
        fi
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "📝 Next steps:"
echo "1. Login: supabase login (or npx supabase login)"
echo "2. Link project: supabase link --project-ref lvvvjywrmpcqrpvuptdi"
echo "3. Set PayFast secrets: ./scripts/set-payfast-secrets.sh"
echo ""


