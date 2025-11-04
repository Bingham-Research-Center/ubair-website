#!/bin/bash
#
# CHPC Environment Setup Script for BasinWx Data Pipeline
# ========================================================
# Run this script once on CHPC to configure the environment
#
# Usage: bash setup_chpc_env.sh
#

set -e  # Exit on error

echo "=========================================="
echo "BasinWx CHPC Environment Setup"
echo "=========================================="
echo ""

# Configuration
# IMPORTANT: Use DATA_UPLOAD_API_KEY to match brc-tools code
DATA_UPLOAD_API_KEY="48cd2f722c19af756e7443230efe9fcc"
BASINWX_API_URL="https://basinwx.com"
CONFIG_DIR="$HOME/.config/ubair-website"
BRC_TOOLS_DIR="$HOME/brc-tools"  # Adjust if different

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Step 1: Checking Python version..."
PYTHON_VERSION=$(python3 --version 2>&1)
echo "✓ Found: $PYTHON_VERSION"
echo ""

echo "Step 2: Checking required Python packages..."
REQUIRED_PACKAGES=("requests" "jsonschema")
MISSING_PACKAGES=()

for package in "${REQUIRED_PACKAGES[@]}"; do
    if python3 -c "import $package" 2>/dev/null; then
        echo "✓ $package installed"
    else
        echo "✗ $package NOT installed"
        MISSING_PACKAGES+=("$package")
    fi
done

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo ""
    echo -e "${YELLOW}Warning: Missing packages: ${MISSING_PACKAGES[*]}${NC}"
    echo "Install with: pip3 install --user ${MISSING_PACKAGES[*]}"
    echo ""
fi

echo ""
echo "Step 3: Creating configuration directory..."
mkdir -p "$CONFIG_DIR"
echo "✓ Created: $CONFIG_DIR"
echo ""

echo "Step 4: Setting up environment variables..."

# Create/update .bashrc entry
BASHRC="$HOME/.bashrc"
if ! grep -q "DATA_UPLOAD_API_KEY" "$BASHRC" 2>/dev/null; then
    echo "" >> "$BASHRC"
    echo "# BasinWx Data Pipeline Configuration" >> "$BASHRC"
    echo "export DATA_UPLOAD_API_KEY=\"$DATA_UPLOAD_API_KEY\"" >> "$BASHRC"
    echo "export BASINWX_API_URL=\"$BASINWX_API_URL\"" >> "$BASHRC"
    echo "✓ Added to $BASHRC"
else
    echo "✓ Already exists in $BASHRC"
fi

# Export for current session
export DATA_UPLOAD_API_KEY="$DATA_UPLOAD_API_KEY"
export BASINWX_API_URL="$BASINWX_API_URL"
echo "✓ Exported for current session"
echo ""

echo "Step 5: Creating website URL config file..."
echo "$BASINWX_API_URL" > "$CONFIG_DIR/website_url"
echo "✓ Created: $CONFIG_DIR/website_url"
echo ""

echo "Step 6: Creating log directory..."
mkdir -p "$HOME/logs/basinwx"
echo "✓ Created: $HOME/logs/basinwx"
echo ""

echo "Step 7: Checking brc-tools installation..."
if [ -d "$BRC_TOOLS_DIR" ]; then
    echo "✓ Found: $BRC_TOOLS_DIR"
    cd "$BRC_TOOLS_DIR"

    # Check for push_data.py
    if [ -f "brc_tools/download/push_data.py" ]; then
        echo "✓ Found: push_data.py"
    else
        echo -e "${RED}✗ push_data.py not found${NC}"
    fi

    # Check git status
    echo ""
    echo "Git status:"
    git status --short || echo "Not a git repository"
else
    echo -e "${YELLOW}Warning: brc-tools not found at $BRC_TOOLS_DIR${NC}"
    echo "Please adjust BRC_TOOLS_DIR in this script"
fi
echo ""

echo "Step 8: Testing API connectivity..."
echo "Running health check..."
if python3 -c "
import os
import requests
api_key = os.environ.get('DATA_UPLOAD_API_KEY')
api_url = os.environ.get('BASINWX_API_URL')
response = requests.get(f'{api_url}/api/health', timeout=10)
print(f'Status: {response.status_code}')
print(f'Response: {response.text}')
" 2>&1; then
    echo "✓ Health check successful"
else
    echo -e "${YELLOW}Warning: Health check failed - server may be down or unreachable${NC}"
fi
echo ""

echo "=========================================="
echo "Setup Summary"
echo "=========================================="
echo ""
echo "Configuration saved to: $CONFIG_DIR"
echo "Environment variables:"
echo "  DATA_UPLOAD_API_KEY: ${DATA_UPLOAD_API_KEY:0:10}..."
echo "  BASINWX_API_URL: $BASINWX_API_URL"
echo ""
echo "Next steps:"
echo "1. Source your bashrc: source ~/.bashrc"
echo "2. Run test script: bash test_upload.sh"
echo "3. Set up cron jobs (see cron_templates/)"
echo ""
echo -e "${GREEN}Setup complete!${NC}"
