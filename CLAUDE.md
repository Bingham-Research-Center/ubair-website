# Uintah Basin Air Quality Website - Claude Context

## Project Overview
Weather data visualization website showing live air quality observations and forecasts for Uintah Basin region.

## Data Pipeline
**CHPC (compute server)** → **POST /api/upload/:dataType** → **Akamai (web server)**

### Data Flow
1. **CHPC**: Python script using `brc-tools` pulls from Synoptic Weather API
2. **Processing**: Data goes through polars/pandas → JSON format
3. **Transfer**: Secure POST to `/api/upload/:dataType` with API key
4. **Display**: Leaflet maps on Node.js website at basinwx.com

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

## Team Notes
- 4-person collaborative team
- CSS-HTML mapping: fire.css ↔ fire.html pattern
- Clean codebase with minimal redundancy
- 20-item improvement list available (IMPROVEMENTS.md)

## AI Agent Management
- **Validation**: Run `npm run validate-ai-files` before committing AI context changes
- **Testing**: Use `npm run test-ai-context` to verify AI understanding
- **Best practices**: See `docs/AI-AGENT-MANAGEMENT.md` for team coordination
- **Workflow**: Follow `docs/AI-WORKFLOW-CHECKLIST.md` for daily/weekly tasks
- **Quick start**: Reference `docs/AI-MANAGEMENT-README.md` for setup