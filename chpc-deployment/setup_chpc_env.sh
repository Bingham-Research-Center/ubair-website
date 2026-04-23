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
#
# Secrets are NEVER hardcoded in this script. Populate them in your shell
# environment before running (or accept the prompts below).
#
# IMPORTANT: Use DATA_UPLOAD_API_KEY to match brc-tools code.
# BASINWX_API_URLS is a comma-separated fan-out list. The first URL is the
# primary destination (its failure fails the job); remaining URLs are
# best-effort mirrors. No default — an operator must opt in explicitly so we
# never silently upload to production.
: "${DATA_UPLOAD_API_KEY:=}"
: "${BASINWX_API_URLS:=}"

if [ -z "$DATA_UPLOAD_API_KEY" ]; then
    read -r -s -p "DATA_UPLOAD_API_KEY (input hidden): " DATA_UPLOAD_API_KEY
    echo ""
fi
if [ -z "$DATA_UPLOAD_API_KEY" ]; then
    echo "ERROR: DATA_UPLOAD_API_KEY must be set. Aborting." >&2
    exit 1
fi

if [ -z "$BASINWX_API_URLS" ]; then
    echo ""
    echo "BASINWX_API_URLS is a comma-separated fan-out list."
    echo "  First URL = primary (failure fails the job)."
    echo "  Remaining URLs = best-effort mirrors."
    echo "Examples:"
    echo "  https://basinwx.dev                           (dev only, safe)"
    echo "  https://basinwx.com,https://basinwx.dev       (full production fan-out)"
    read -r -p "BASINWX_API_URLS: " BASINWX_API_URLS
fi
if [ -z "$BASINWX_API_URLS" ]; then
    echo "ERROR: BASINWX_API_URLS must be set. Aborting." >&2
    exit 1
fi

CONFIG_DIR="$HOME/.config/ubair-website"
BRC_TOOLS_DIR="$HOME/gits/brc-tools"  # Adjust if different

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

# Create/update .bashrc entries. Each export is checked independently so a
# partially-migrated .bashrc (e.g. has DATA_UPLOAD_API_KEY from the old script
# but not BASINWX_API_URLS) gets fully updated on re-run.
BASHRC="$HOME/.bashrc"
add_bashrc_export() {
    local var="$1" value="$2"
    if ! grep -q "^export ${var}=" "$BASHRC" 2>/dev/null; then
        echo "export ${var}=\"${value}\"" >> "$BASHRC"
        echo "  + added export $var to $BASHRC"
    else
        echo "  ✓ export $var already present in $BASHRC"
    fi
}

if ! grep -q "# BasinWx Data Pipeline Configuration" "$BASHRC" 2>/dev/null; then
    echo "" >> "$BASHRC"
    echo "# BasinWx Data Pipeline Configuration" >> "$BASHRC"
fi
add_bashrc_export DATA_UPLOAD_API_KEY "$DATA_UPLOAD_API_KEY"
add_bashrc_export BASINWX_API_KEY "\$DATA_UPLOAD_API_KEY"
add_bashrc_export BASINWX_API_URLS "$BASINWX_API_URLS"

# Export for current session
export DATA_UPLOAD_API_KEY="$DATA_UPLOAD_API_KEY"
export BASINWX_API_KEY="$DATA_UPLOAD_API_KEY"
export BASINWX_API_URLS="$BASINWX_API_URLS"
echo "✓ Exported for current session"
echo ""

echo "Step 5: Creating website URL config files..."
echo "$BASINWX_API_URLS" > "$CONFIG_DIR/website_urls"
echo "✓ Created: $CONFIG_DIR/website_urls"
# Back-compat: legacy brc-tools helpers read ~/.config/ubair-website/website_url
# (singular). Write the primary URL there so old callers keep working until
# they're migrated.
PRIMARY_URL_FOR_FILE="${BASINWX_API_URLS%%,*}"
echo "$PRIMARY_URL_FOR_FILE" > "$CONFIG_DIR/website_url"
echo "✓ Created: $CONFIG_DIR/website_url (legacy single-URL file, primary only)"
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

echo "Step 8: Testing API connectivity for every destination..."
IFS=',' read -r -a URL_ARRAY <<< "$BASINWX_API_URLS"
for i in "${!URL_ARRAY[@]}"; do
    url="${URL_ARRAY[$i]}"
    url="${url// /}"
    role="mirror"
    [ "$i" = "0" ] && role="primary"
    echo "  [$role] $url"
    if python3 -c "
import requests, sys
try:
    r = requests.get('$url/api/health', timeout=10)
    print(f'    Status: {r.status_code}')
    sys.exit(0 if r.status_code == 200 else 1)
except Exception as e:
    print(f'    Error: {e}')
    sys.exit(1)
" 2>&1; then
        echo "  ✓ Reachable"
    else
        if [ "$role" = "primary" ]; then
            echo -e "${RED}  ✗ Primary health check failed — CHPC uploads will fail${NC}"
        else
            echo -e "${YELLOW}  ⚠ Mirror health check failed — uploads will still attempt but log WARN${NC}"
        fi
    fi
done
echo ""

echo "=========================================="
echo "Setup Summary"
echo "=========================================="
echo ""
echo "Configuration saved to: $CONFIG_DIR"
echo "Environment variables:"
echo "  DATA_UPLOAD_API_KEY: ${DATA_UPLOAD_API_KEY:0:10}..."
echo "  BASINWX_API_URLS:    $BASINWX_API_URLS"
echo ""
echo "Next steps:"
echo "1. Source your bashrc: source ~/.bashrc"
echo "2. Run test script: bash test_upload.sh"
echo "3. Set up cron jobs (see cron_templates/)"
echo ""
echo -e "${GREEN}Setup complete!${NC}"
