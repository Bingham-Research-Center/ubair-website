# SOP: Forecast Outlooks

## Quick reference

```bash
# On the web server (as jrlawson or root):
cd /var/www/ubair-website

node scripts/new-outlook.cjs                   # draft for right now
node scripts/new-outlook.cjs 20260306 1300     # draft for specific time
nano public/api/static/outlooks/draft_*.md     # edit your draft
node scripts/new-outlook.cjs --validate draft_20260306_1300.md
node scripts/new-outlook.cjs --publish  draft_20260306_1300.md
```

## Workflow

### 1. Generate a draft

```bash
node scripts/new-outlook.cjs [YYYYMMDD] [HHMM]
```

Creates `draft_YYYYMMDD_HHMM.md` in the outlooks folder with dates auto-filled.
The `draft_` prefix keeps it **off the website** — only `outlook_` files appear.

### 2. Edit the draft

Replace every `[BRACKETED]` placeholder. The validator will catch any you miss.

**Risk line** — pick one (exact text, all caps, on its own line):
- `NO RISK OF ELEVATED OZONE` (renders green)
- `LOW RISK OF ELEVATED OZONE` (renders blue)
- `SOME RISK OF ELEVATED OZONE` (renders orange)
- `MODERATE RISK OF ELEVATED OZONE` (renders orange)
- `HIGH RISK OF ELEVATED OZONE` (renders red)

**Confidence line** — pick one (exact text, all caps, on its own line):
- `HIGH CONFIDENCE` (renders green — reassuring)
- `MEDIUM CONFIDENCE` (renders orange)
- `MODERATE CONFIDENCE` (renders orange)
- `LOW CONFIDENCE` (renders red — uncertain)

### 3. Validate

```bash
node scripts/new-outlook.cjs --validate draft_20260306_1300.md
```

Checks: required sections, valid risk/confidence phrases, no leftover placeholders.

### 4. Publish

```bash
node scripts/new-outlook.cjs --publish draft_20260306_1300.md
```

Runs validation, then renames `draft_` → `outlook_`. The server picks it up within 5 minutes.

### 5. Upload from CHPC (alternative)

If uploading from CHPC instead of editing on the server:

```bash
python -m brc_tools.download.push_outlook outlook_YYYYMMDD_HHMM.md
```

Requires `DATA_UPLOAD_API_KEY` env var and `~/.config/ubair-website/website_url`.

## Server access for non-root users

To let `jrlawson` (or other users) run the script without root:

```bash
# One-time setup (run as root):
sudo usermod -aG www-data jrlawson
sudo chmod g+w /var/www/ubair-website/public/api/static/outlooks/
# jrlawson must log out and back in for group change to take effect.
```

Then as `jrlawson`:
```bash
cd /var/www/ubair-website
node scripts/new-outlook.cjs 20260306 1300
```

## Troubleshooting

- **Colors not showing**: Risk/confidence must be exact phrases, all caps, own line
- **Not in list**: Filename must be `outlook_YYYYMMDD_HHMM.md` (not `draft_`)
- **Permission denied**: Ensure you're in the `www-data` group (see above)
- **Upload fails from CHPC**: Check API key and hostname validation
