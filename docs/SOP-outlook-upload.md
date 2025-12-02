# SOP: Uploading Forecast Outlooks

> **Note**: This is a temporary SOP document. In future, SOPs and "getting started" guides will live in the project Wiki. See GitHub Wiki for the canonical source once established.

## Overview

Forecast outlooks are markdown files uploaded from CHPC to the BasinWx website. They appear at [basinwx.com/forecast_outlooks](https://www.basinwx.com/forecast_outlooks) within 5 minutes of upload.

## Workflow

### 1. Copy the template

```bash
cd ~/outlooks  # or wherever you store drafts
cp /path/to/template-2025-2026.md outlook_$(date +%Y%m%d_%H%M).md
```

Filename **must** match pattern: `outlook_YYYYMMDD_HHMM.md`

### 2. Edit the outlook

Replace all `[bracketed]` placeholders:
- `[H.MMam/pm]` → e.g., `11.30am`
- `[D Month YYYY]` → e.g., `1 December 2025`
- `[Day D Mon]` → e.g., `Mon 1 Dec`
- Risk level → one of: `NO`, `LOW`, `MODERATE`, `HIGH`
- Confidence → one of: `LOW`, `MODERATE`, `HIGH`

**Important for color-coding**: Risk and confidence lines must contain exact phrases:
- `NO RISK OF ELEVATED OZONE` (renders green)
- `LOW RISK OF ELEVATED OZONE` (renders blue)
- `MODERATE RISK OF ELEVATED OZONE` (renders orange)
- `HIGH RISK OF ELEVATED OZONE` (renders red)
- `HIGH CONFIDENCE` / `MODERATE CONFIDENCE` / `LOW CONFIDENCE`

### 3. Upload from CHPC

```bash
# Ensure brc-tools is installed and configured
python -m brc_tools.download.push_outlook outlook_YYYYMMDD_HHMM.md
```

Requirements:
- `DATA_UPLOAD_API_KEY` environment variable set
- `~/.config/ubair-website/website_url` file with server URL

### 4. Verify

Check [basinwx.com/forecast_outlooks](https://www.basinwx.com/forecast_outlooks) within 5 minutes.

The `outlooks_list.json` auto-regenerates every 5 minutes on the server.

## Troubleshooting

- **Upload fails**: Check API key and hostname validation
- **Colors not showing**: Ensure exact phrasing (e.g., `HIGH RISK` not `High Risk`)
- **Not appearing in list**: Filename must match `outlook_YYYYMMDD_HHMM.md` pattern

## Future Plans

- Wiki-based SOP documentation
- Validation script for markdown structure
- Integration with email distribution list
