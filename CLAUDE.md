# Uintah Basin Air Quality Website - Claude Context

## Project Overview
Weather data visualization website showing live air quality observations and forecasts for Uintah Basin region.

## Deployment Topology
The operational core must be agnostic to which server / branch it runs on.

| Role | Branch | Domain | pm2 app name |
|---|---|---|---|
| Production | `ops` | `www.basinwx.com` | `basinwx-ops` |
| Rehearsal mirror | `dev` | `www.basinwx.dev` | `basinwx-dev` |

- Both boxes: Linode, repo at `/srv/ubair-website`, pm2 run as the `deploy` user, nginx reverse proxy, Let's Encrypt certs.
- pm2 app name is derived from `git rev-parse --abbrev-ref HEAD` (see `ecosystem.config.cjs`), so whichever branch is checked out dictates the running app identity.
- `www.basinwx.dev` receives the same CHPC data as `.com` (fan-out upload) and runs whichever branch is checked out, so merging a PR into `dev` is a real-world dry-run before promotion to `ops`. It is also where stakeholder demos happen.
- A third developer laptop/VM may also run this repo. It is **not operational**, may have broken paths, and must never be the source of truth.
- Full bring-up runbook, nginx template, cert renewal, and "did this work?" sanity checklist live in `docs/DEPLOYMENT.md`.

### Bring-up lessons learnt (keep for future re-provisioning)
- **Linode Cloud Firewall defaults to Drop.** A fresh linode blocks 80/443 until you explicitly accept them. Symptoms: `certbot renew --dry-run` times out on the ACME challenge, site is unreachable externally, but internal `curl -I http://127.0.0.1:${PORT}` works fine. Check each box's firewall rules in the Linode console before assuming nginx or certbot are broken.
- **Don't use `certbot --manual` for these domains.** Its renewal config writes `authenticator = manual`, which the systemd timer cannot drive non-interactively — the cert silently fails to renew until it expires. Always use `certbot certonly --nginx` (or `--webroot`) so renewal is automated. Verify with `sudo certbot renew --dry-run`.
- **`.dev` TLDs trip some client networks.** HSTS-preload plus occasional SNI-based filtering on corporate/campus/ISP routers produces "connection reset" errors that look like the server is down. Always phone-tether test (`curl -I https://www.basinwx.dev/` on a mobile hotspot) before blaming the server; if it works on cellular, the site is fine and the user's LAN is the culprit.
- **`pm2 startup` is not optional.** Without the systemd unit a reboot silently loses the site. Confirm with `systemctl list-unit-files | grep pm2`.

## Data Pipeline
**CHPC (compute server)** → **POST /api/upload/:dataType** → **both `www.basinwx.com` and `www.basinwx.dev`**

### Data Flow
1. **CHPC**: `brc-tools` fetches from Synoptic Weather API / HRRR via herbie-data
2. **Processing**: polars/pandas → JSON
3. **Transfer**: Secure POST to `/api/upload/:dataType` with API key + CHPC hostname validation, fanned out to every URL in `BASINWX_API_URLS` (first = primary, rest = best-effort mirrors)
4. **Display**: Leaflet maps on Node.js website (live on `.com`, rehearsal on `.dev`)

### Data Types
- **Live observations**: `map_obs_YYYYMMDD_HHMMZ.json` (geographic weather data)
- **Station metadata**: `map_obs_meta_YYYYMMDD_HHMMZ.json` (station info)
- **Time series**: Ozone concentration data
- **Markdown outlooks**: Weather forecast text
- **Images**: PNG files for visualization

## API Endpoints
- **Upload**: `POST /api/upload/:dataType` (CHPC only, API key required)
- **Fetch data**: `GET /api/static/{filename}`
- **File listing**: `GET /api/filelist.json`
- **Live observations**: `GET /api/live-observations`

## Security
- API key authentication via `x-api-key` header
- CHPC hostname validation (chpc.utah.edu)
- File type validation (JSON/MD/TXT only)
- 10MB file size limit

## Tech Stack
- **Backend**: Node.js, Express, Multer
- **Frontend**: Leaflet, Plotly.js, vanilla JavaScript
- **Data**: JSON files, Markdown content

## Known Issues & Redundancy
1. **Multiple CSS files** with similar styles (13 files)
2. **Console.log statements** throughout codebase
3. **TODO comments** for unfinished features
4. **Unused code** in many files
5. **Images folder** has many unused files

## Testing
- **Development**: `npm run dev` (nodemon)
- **API testing**: `npm run test-api` (automated script)
- **Manual API test**: `POST localhost:${PORT}/api/upload/observations` (PORT from `.env`; typically 3000 on ops, 3001 on dev)
- **Example data**: Files in `/public/api/static/`

## Features
- **Responsive design**: Mobile/tablet friendly with percentage-based layouts
- **90s Mode toggle**: Iridescent background with sparkle animations
- **Secure uploads**: API key + hostname validation
- **Real-time data**: Automatic refresh every 10 minutes

## Recent Updates
- **PR #178 (2026-04-22)**: operational-agnosticism pass — branch-derived pm2 app name, fan-out CHPC uploader (`BASINWX_API_URLS`), `docs/DEPLOYMENT.md` runbook, host-aware sidebar brand
- Implemented 90s mode toggle with holographic background
- Created data schema documentation (DATA_SCHEMA.md)
- Moved unused images to `/public/images/unused/`

## Secret Management
Environment variables are used for all API keys and sensitive configuration:
- **Copy setup**: `cp .env.example .env` and fill in your values
- **Required keys**: DATA_UPLOAD_API_KEY, UDOT_API_KEY, SYNOPTIC_API_TOKEN
- **Never commit**: .env files are gitignored automatically
- **Team sharing**: Use secure password manager (1Password, Bitwarden) for sharing secrets
- **Production**: Set environment variables directly on server/cloud platform

## Protected Branches
**Never push directly to `dev`, `ops`, or `main`.**  All changes to these branches must go through a pull request. If you believe a direct push is warranted, ask the user to confirm — then ask a **second time** to be sure before proceeding. This applies to merges, reverts, version bumps, and any other commits.

## Team Notes
- Small collaborative team (lead + RAs — see README for current roster)
- CSS-HTML mapping: fire.css ↔ fire.html pattern
- 20-item improvement list available (IMPROVEMENTS.md)