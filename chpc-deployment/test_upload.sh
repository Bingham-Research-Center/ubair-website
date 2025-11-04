#!/bin/bash
#
# CHPC Upload Test Script for BasinWx Data Pipeline
# ==================================================
# Tests the complete upload workflow from CHPC to website
#
# Usage:
#   bash test_upload.sh                    # Run all tests
#   bash test_upload.sh --health-only      # Health check only
#   bash test_upload.sh --validate-only    # Validation only
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BRC_TOOLS_DIR="$HOME/brc-tools"
TEST_DATA_DIR="$BRC_TOOLS_DIR/test_data"
UPLOAD_SCRIPT="$BRC_TOOLS_DIR/brc_tools/download/push_data.py"
MANIFEST_URL="https://basinwx.com/DATA_MANIFEST.json"

echo ""
echo "=========================================="
echo "BasinWx Upload Test Suite"
echo "=========================================="
echo ""

# Parse arguments
HEALTH_ONLY=false
VALIDATE_ONLY=false

for arg in "$@"; do
    case $arg in
        --health-only)
            HEALTH_ONLY=true
            ;;
        --validate-only)
            VALIDATE_ONLY=true
            ;;
    esac
done

# Test 1: Environment Check
echo -e "${BLUE}Test 1: Environment Check${NC}"
echo "----------------------------------------"

if [ -z "$DATA_UPLOAD_API_KEY" ]; then
    echo -e "${RED}✗ DATA_UPLOAD_API_KEY not set${NC}"
    echo "  Run: source ~/.bashrc"
    exit 1
else
    echo -e "${GREEN}✓ DATA_UPLOAD_API_KEY set${NC} (${DATA_UPLOAD_API_KEY:0:10}...)"
fi

if [ -z "$BASINWX_API_URL" ]; then
    echo -e "${YELLOW}⚠ BASINWX_API_URL not set, using default${NC}"
    export BASINWX_API_URL="https://basinwx.com"
fi
echo -e "${GREEN}✓ BASINWX_API_URL${NC}: $BASINWX_API_URL"

# Check Python packages
for package in requests jsonschema; do
    if python3 -c "import $package" 2>/dev/null; then
        echo -e "${GREEN}✓ Python package:${NC} $package"
    else
        echo -e "${RED}✗ Missing package:${NC} $package"
        echo "  Install: pip3 install --user $package"
        exit 1
    fi
done

echo ""

# Test 2: Network Connectivity
echo -e "${BLUE}Test 2: Network Connectivity${NC}"
echo "----------------------------------------"

echo "Testing connection to $BASINWX_API_URL..."
if curl -s --connect-timeout 10 "$BASINWX_API_URL" > /dev/null; then
    echo -e "${GREEN}✓ Website reachable${NC}"
else
    echo -e "${RED}✗ Cannot reach website${NC}"
    echo "  Check network/firewall settings"
    exit 1
fi

echo ""

# Test 3: API Health Check
echo -e "${BLUE}Test 3: API Health Check${NC}"
echo "----------------------------------------"

HEALTH_RESPONSE=$(python3 << 'EOF'
import os
import requests
import json
try:
    api_url = os.environ.get('BASINWX_API_URL', 'https://basinwx.com')
    response = requests.get(f'{api_url}/api/health', timeout=10)
    print(f"STATUS:{response.status_code}")
    if response.status_code == 200:
        print(f"RESPONSE:{response.text}")
except Exception as e:
    print(f"ERROR:{e}")
EOF
)

if echo "$HEALTH_RESPONSE" | grep -q "STATUS:200"; then
    echo -e "${GREEN}✓ API health check passed${NC}"
    echo "$HEALTH_RESPONSE" | grep "RESPONSE:" | sed 's/RESPONSE:/  /'
else
    echo -e "${RED}✗ API health check failed${NC}"
    echo "$HEALTH_RESPONSE"
    exit 1
fi

if [ "$HEALTH_ONLY" = true ]; then
    echo ""
    echo -e "${GREEN}Health check complete!${NC}"
    exit 0
fi

echo ""

# Test 4: Download Manifest
echo -e "${BLUE}Test 4: Manifest Validation${NC}"
echo "----------------------------------------"

MANIFEST_FILE="/tmp/DATA_MANIFEST_test.json"
if curl -s "$MANIFEST_URL" -o "$MANIFEST_FILE"; then
    echo -e "${GREEN}✓ Downloaded manifest${NC}"

    MANIFEST_VERSION=$(python3 -c "import json; print(json.load(open('$MANIFEST_FILE'))['version'])" 2>/dev/null || echo "unknown")
    echo "  Version: $MANIFEST_VERSION"

    DATA_TYPES=$(python3 -c "import json; print(', '.join(json.load(open('$MANIFEST_FILE'))['dataTypes'].keys()))" 2>/dev/null || echo "unknown")
    echo "  Data types: $DATA_TYPES"
else
    echo -e "${YELLOW}⚠ Could not download manifest${NC}"
fi

echo ""

# Test 5: Check for Sample Data
echo -e "${BLUE}Test 5: Sample Data Check${NC}"
echo "----------------------------------------"

# Look for recent observation files
SAMPLE_FILES=$(find "$TEST_DATA_DIR" -name "map_obs_*.json" -type f 2>/dev/null | head -3)

if [ -z "$SAMPLE_FILES" ]; then
    # Try alternate location
    SAMPLE_FILES=$(find "$BRC_TOOLS_DIR/output" -name "map_obs_*.json" -type f 2>/dev/null | head -3)
fi

if [ -z "$SAMPLE_FILES" ]; then
    echo -e "${YELLOW}⚠ No sample data files found${NC}"
    echo "  Expected location: $TEST_DATA_DIR"
    echo "  You'll need to generate data before uploading"
else
    echo -e "${GREEN}✓ Found sample data files:${NC}"
    echo "$SAMPLE_FILES" | while read file; do
        SIZE=$(ls -lh "$file" | awk '{print $5}')
        echo "  - $(basename $file) ($SIZE)"
    done
fi

if [ "$VALIDATE_ONLY" = true ]; then
    echo ""
    echo -e "${GREEN}Validation complete!${NC}"
    exit 0
fi

echo ""

# Test 6: Test Upload (if sample data exists)
echo -e "${BLUE}Test 6: Test Upload${NC}"
echo "----------------------------------------"

if [ -n "$SAMPLE_FILES" ]; then
    TEST_FILE=$(echo "$SAMPLE_FILES" | head -1)
    echo "Using test file: $(basename $TEST_FILE)"
    echo ""

    echo "Running upload test..."
    if python3 << EOF
import os
import sys
import requests
import socket

api_key = os.environ.get('DATA_UPLOAD_API_KEY')
api_url = os.environ.get('BASINWX_API_URL', 'https://basinwx.com')
hostname = socket.gethostname()

headers = {
    'x-api-key': api_key,
    'x-client-hostname': hostname
}

test_file = "$TEST_FILE"
with open(test_file, 'rb') as f:
    files = {'file': (os.path.basename(test_file), f)}
    try:
        response = requests.post(
            f'{api_url}/api/upload/observations',
            headers=headers,
            files=files,
            timeout=30
        )
        print(f'Status: {response.status_code}')
        print(f'Response: {response.text}')
        sys.exit(0 if response.status_code == 200 else 1)
    except Exception as e:
        print(f'Error: {e}')
        sys.exit(1)
EOF
    then
        echo -e "${GREEN}✓ Test upload successful!${NC}"
    else
        echo -e "${RED}✗ Test upload failed${NC}"
        echo ""
        echo "Common issues:"
        echo "  1. API key mismatch - check DATA_UPLOAD_API_KEY"
        echo "  2. Origin validation - must run from chpc.utah.edu"
        echo "  3. Network/firewall blocking HTTPS to basinwx.com"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ Skipping upload test - no sample data${NC}"
    echo "  Generate data first with brc-tools"
fi

echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo -e "${GREEN}✓ All tests passed!${NC}"
echo ""
echo "You're ready to:"
echo "  1. Set up cron jobs for automated uploads"
echo "  2. Monitor /tmp/basinwx_upload.log"
echo "  3. Check data freshness at $BASINWX_API_URL/api/monitoring/freshness"
echo ""
