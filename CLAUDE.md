# Uintah Basin Air Quality Website - Claude Context

## Project Overview
Weather data visualization website showing live air quality observations and forecasts for Uintah Basin region.

## Infrastructure

### Servers
| Server | URL | Branch | Purpose |
|--------|-----|--------|---------|
| **CHPC** (University of Utah) | — | — | Runs `brc-tools` Python scripts. Fetches weather data, processes it, POSTs JSON to web servers. |
| **Staging** (Akamai/Linode) | `basinwx.dev` | `dev` | Testing and staging. Test new features and uploads here first. |
| **Production** (Akamai/Linode) | `basinwx.com` | `ops` | Live public site. Only receives data once verified on staging. |

### Data Pipeline
**CHPC** → **POST /api/upload/:dataType** → **basinwx.dev or basinwx.com**

1. **CHPC**: `brc-tools` fetches from Synoptic Weather API / HRRR via herbie-data
2. **Processing**: polars/pandas → JSON
3. **Transfer**: Secure POST to `/api/upload/:dataType` with API key + CHPC hostname validation
4. **Display**: Leaflet maps on Node.js website

Upload target is configured per-server in `~/.config/ubair-website/website_url` on CHPC. Point at `basinwx.dev` for testing, `basinwx.com` for production.

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
- **Manual API test**: `POST localhost:3000/api/upload/observations`
- **Example data**: Files in `/public/api/static/`

## Features
- **Responsive design**: Mobile/tablet friendly with percentage-based layouts
- **90s Mode toggle**: Iridescent background with sparkle animations
- **Secure uploads**: API key + hostname validation
- **Real-time data**: Automatic refresh every 10 minutes

## Recent Updates
- Removed all synthetic/demo data generation
- Added comprehensive mobile responsiveness
- Implemented 90s mode toggle with holographic background
- Created data schema documentation (DATA_SCHEMA.md)
- Added API testing script and SSL setup guide
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
- 4-person collaborative team
- CSS-HTML mapping: fire.css ↔ fire.html pattern
- Clean codebase with minimal redundancy
- 20-item improvement list available (IMPROVEMENTS.md)