#!/bin/bash
# UBAIR Data Pipeline Diagnostic Script
# Run on both Akamai and CHPC to compare data state
#
# Usage (from ubair-website repo on either server):
#   cd ~/gits/ubair-website  # or wherever the repo is
#   bash ubair-diagnostic.sh > diagnostic-$(hostname)-$(date +%Y%m%d-%H%M).txt 2>&1
#
# Conda env on CHPC: integration-clyfar-v0.9.5

echo "========================================"
echo "UBAIR DIAGNOSTIC REPORT"
echo "========================================"
echo "Hostname: $(hostname)"
echo "Date: $(date)"
echo "User: $(whoami)"
echo "PWD: $(pwd)"
echo ""

# Detect server type
if [[ $(hostname) == *"chpc"* ]] || [[ $(hostname) == *"notch"* ]] || [[ -d "$HOME/gits/clyfar" ]]; then
    SERVER_TYPE="CHPC"
elif [[ -d "/var/www" ]] || [[ -d "$HOME/ubair-website" ]]; then
    SERVER_TYPE="AKAMAI"
else
    SERVER_TYPE="UNKNOWN"
fi
echo "Detected server type: $SERVER_TYPE"
echo ""

echo "========================================"
echo "1. WEBSITE DATA DIRECTORIES"
echo "========================================"

# Find the website root
WEBSITE_ROOTS=(
    "$HOME/ubair-website"
    "$HOME/gits/ubair-website"
    "/var/www/ubair-website"
    "/var/www/html/ubair-website"
    "$(pwd)"
)

WEBSITE_ROOT=""
for dir in "${WEBSITE_ROOTS[@]}"; do
    if [[ -d "$dir/public/api/static" ]]; then
        WEBSITE_ROOT="$dir"
        break
    fi
done

if [[ -n "$WEBSITE_ROOT" ]]; then
    echo "Website root found: $WEBSITE_ROOT"
    echo ""

    STATIC_DIR="$WEBSITE_ROOT/public/api/static"

    echo "--- Directory structure ---"
    ls -la "$STATIC_DIR" 2>/dev/null || echo "Cannot access $STATIC_DIR"
    echo ""

    # Check each data type
    for subdir in observations metadata images forecasts outlooks timeseries; do
        echo "--- $subdir/ ---"
        if [[ -d "$STATIC_DIR/$subdir" ]]; then
            FILE_COUNT=$(ls -1 "$STATIC_DIR/$subdir" 2>/dev/null | wc -l | tr -d ' ')
            echo "File count: $FILE_COUNT"
            echo "Most recent 5 files:"
            ls -lt "$STATIC_DIR/$subdir" 2>/dev/null | head -6
            echo ""

            # Show newest file content preview for JSON
            if [[ "$subdir" == "observations" ]] || [[ "$subdir" == "metadata" ]]; then
                NEWEST=$(ls -t "$STATIC_DIR/$subdir"/*.json 2>/dev/null | head -1)
                if [[ -n "$NEWEST" ]]; then
                    echo "Newest file: $NEWEST"
                    echo "First 500 chars:"
                    head -c 500 "$NEWEST" 2>/dev/null
                    echo ""
                fi
            fi
        else
            echo "Directory does not exist"
        fi
        echo ""
    done

    # Check filelist.json
    echo "--- filelist.json ---"
    if [[ -f "$STATIC_DIR/filelist.json" ]]; then
        echo "Exists. Contents:"
        cat "$STATIC_DIR/filelist.json" 2>/dev/null | head -50
    else
        echo "Does not exist"
    fi
    echo ""

    # Check for GEFS specifically
    echo "--- GEFS PNG Search ---"
    find "$STATIC_DIR" -name "*GEFS*" -o -name "*gefs*" -o -name "*meteogram*" 2>/dev/null | head -20
    echo ""

    # Check for heatmaps
    echo "--- Heatmap Search ---"
    find "$STATIC_DIR" -name "*heatmap*" -o -name "*dailymax*" 2>/dev/null | head -20
    echo ""

else
    echo "WARNING: Could not find website root directory"
    echo "Searched: ${WEBSITE_ROOTS[*]}"
fi
echo ""

echo "========================================"
echo "2. CLYFAR STATUS (CHPC ONLY)"
echo "========================================"

if [[ "$SERVER_TYPE" == "CHPC" ]]; then
    CLYFAR_DIRS=(
        "$HOME/gits/clyfar"
        "$HOME/clyfar"
    )

    for cdir in "${CLYFAR_DIRS[@]}"; do
        if [[ -d "$cdir" ]]; then
            echo "Clyfar found at: $cdir"
            echo ""

            echo "--- Git status ---"
            cd "$cdir" && git log --oneline -5 2>/dev/null
            git branch --show-current 2>/dev/null
            git status --short 2>/dev/null
            echo ""

            echo "--- Data output directory ---"
            if [[ -d "$cdir/data" ]]; then
                ls -lt "$cdir/data" 2>/dev/null | head -10
            elif [[ -d "$cdir/output" ]]; then
                ls -lt "$cdir/output" 2>/dev/null | head -10
            fi
            echo ""

            echo "--- Recent PNG files ---"
            find "$cdir" -name "*.png" -mtime -7 2>/dev/null | head -20
            echo ""

            echo "--- Recent JSON files ---"
            find "$cdir" -name "*.json" -mtime -7 2>/dev/null | head -20
            echo ""

            break
        fi
    done

    echo "--- Crontab ---"
    crontab -l 2>/dev/null || echo "No crontab or cannot access"
    echo ""

    echo "--- Recent log files ---"
    for logdir in "$HOME/logs" "$HOME/gits/clyfar/logs" "/tmp"; do
        if [[ -d "$logdir" ]]; then
            echo "Checking $logdir:"
            ls -lt "$logdir"/*clyfar* "$logdir"/*ubair* 2>/dev/null | head -5
        fi
    done
    echo ""

    echo "--- Conda environments ---"
    conda env list 2>/dev/null || echo "Conda not available"
    echo ""

    echo "--- Test integration-clyfar-v0.9.5 env ---"
    if command -v conda &> /dev/null; then
        source "$(conda info --base)/etc/profile.d/conda.sh" 2>/dev/null
        conda activate integration-clyfar-v0.9.5 2>/dev/null && {
            echo "Activated integration-clyfar-v0.9.5"
            python -c "from synoptic.services import Latest; print('synopticpy import OK')" 2>&1
            python -c "import brc_tools; print(f'brc_tools version: {brc_tools.__version__ if hasattr(brc_tools, \"__version__\") else \"unknown\"}')" 2>&1
            python -c "from brc_tools.utils.lookups import ubair_aq_stids; print(f'ubair_aq_stids defined: {len(ubair_aq_stids)} stations')" 2>&1 || echo "ubair_aq_stids not found (old brc-tools)"
            conda deactivate
        } || echo "Could not activate integration-clyfar-v0.9.5"
    fi
    echo ""

    echo "--- brc-tools location ---"
    BRC_DIRS=(
        "$HOME/gits/brc-tools"
        "$HOME/brc-tools"
    )
    for bdir in "${BRC_DIRS[@]}"; do
        if [[ -d "$bdir" ]]; then
            echo "brc-tools found at: $bdir"
            cd "$bdir" && git log --oneline -3 2>/dev/null
            git branch --show-current 2>/dev/null
            break
        fi
    done
    echo ""

else
    echo "Not CHPC - skipping Clyfar checks"
fi
echo ""

echo "========================================"
echo "3. NODE/PM2 STATUS (AKAMAI ONLY)"
echo "========================================"

if [[ "$SERVER_TYPE" == "AKAMAI" ]] || command -v pm2 &> /dev/null; then
    echo "--- PM2 processes ---"
    pm2 list 2>/dev/null || echo "PM2 not available or not running"
    echo ""

    echo "--- PM2 logs (last 30 lines) ---"
    pm2 logs --lines 30 --nostream 2>/dev/null || echo "Cannot get PM2 logs"
    echo ""

    echo "--- Node version ---"
    node --version 2>/dev/null || echo "Node not found"
    echo ""

    echo "--- .env file check (keys only, no values) ---"
    if [[ -n "$WEBSITE_ROOT" ]] && [[ -f "$WEBSITE_ROOT/.env" ]]; then
        echo ".env exists. Keys defined:"
        grep -E "^[A-Z_]+=" "$WEBSITE_ROOT/.env" 2>/dev/null | cut -d= -f1
    else
        echo ".env not found"
    fi
    echo ""
else
    echo "Not Akamai - skipping PM2 checks"
fi
echo ""

echo "========================================"
echo "4. API ENDPOINT TEST"
echo "========================================"

# Test local API if server is running
echo "--- Testing localhost API ---"
for endpoint in "/api/filelist/observations" "/api/filelist/images" "/api/filelist/forecasts"; do
    echo "GET http://localhost:3000$endpoint"
    curl -s -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:3000$endpoint" 2>/dev/null || echo "Failed/not running"
done
echo ""

echo "--- Testing production API ---"
for endpoint in "/api/filelist/observations" "/api/filelist/images" "/api/filelist/forecasts"; do
    echo "GET https://basinwx.com$endpoint"
    curl -s -o /dev/null -w "HTTP %{http_code}\n" "https://basinwx.com$endpoint" 2>/dev/null || echo "Failed"
done
echo ""

echo "========================================"
echo "5. DISK SPACE"
echo "========================================"
df -h ~ 2>/dev/null || df -h . 2>/dev/null
echo ""

echo "========================================"
echo "6. RECENT SYSTEM ACTIVITY"
echo "========================================"
echo "--- Files modified in last 24 hours in static dir ---"
if [[ -n "$WEBSITE_ROOT" ]]; then
    find "$WEBSITE_ROOT/public/api/static" -type f -mtime -1 2>/dev/null | head -30
fi
echo ""

echo "========================================"
echo "END OF DIAGNOSTIC REPORT"
echo "========================================"
echo "Please share this output for analysis."
