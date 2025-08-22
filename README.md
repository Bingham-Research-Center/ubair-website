# Uintah Basin Air Quality Website

A real-time weather data visualization website showing live air quality observations and forecasts for the Uintah Basin region. This project provides interactive maps, time series data, and meteorological outlooks to support air quality monitoring and research.

🌐 **Live Site**: [basinwx.com](https://basinwx.com)

## Quick Start

### Prerequisites
- Node.js (v14+ recommended)
- npm or yarn

### Installation & Setup
```bash
# Clone the repository
git clone https://github.com/Bingham-Research-Center/ubair-website.git
cd ubair-website

# Install dependencies
npm install

# Start development server
npm run dev
```

The site will be available at `http://localhost:3000`

### Available Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm run test-api` - Test API endpoints (requires node-fetch and form-data dependencies)

## Project Overview

This website visualizes air quality and meteorological data for the Uintah Basin region through:

- **Live Monitoring Maps** - Real-time weather station data with interactive Leaflet maps
- **Time Series Visualizations** - Historical data trends using Plotly.js
- **Weather Forecasts** - Meteorological outlooks and predictions
- **Air Quality Forecasts** - Ozone concentration predictions and alerts
- **Mobile-Responsive Design** - Optimized for desktop, tablet, and mobile devices
- **90s Mode** - Fun retro theme with holographic backgrounds and animations

## Architecture & Data Pipeline

```
CHPC (Python/brc-tools) → Synoptic API → POST /api/upload → Node.js Server → Frontend Display
```

### Data Flow
1. **CHPC Server**: Python scripts pull data from Synoptic Weather API using `brc-tools`
2. **Processing**: Data processed through polars/pandas into JSON format
3. **Transfer**: Secure POST to `/api/upload/:dataType` with API key authentication
4. **Display**: Real-time visualization on interactive maps and charts

### Security Features
- API key authentication via `x-api-key` header
- CHPC hostname validation (`chpc.utah.edu`)
- File type validation (JSON/MD/TXT only)
- 10MB file size limit

## Tech Stack

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **Multer** - File upload middleware

### Frontend
- **Vanilla JavaScript** - Core application logic
- **Leaflet** - Interactive mapping
- **Plotly.js** - Data visualization and charting
- **CSS3** - Responsive design and 90s mode animations

### Data Formats
- **JSON** - Weather observations and metadata
- **Markdown** - Weather outlooks and reports
- **PNG** - Images and visualizations

## Project Structure

```
ubair-website/
├── server/                 # Backend server code
│   ├── server.js          # Main Express server
│   └── routes/            # API route handlers
├── public/                # Frontend static files
│   ├── css/              # Stylesheets (14 themed files)
│   ├── js/               # JavaScript modules
│   ├── api/static/       # Uploaded data from CHPC
│   ├── images/           # Icons and assets
│   └── data/             # Static data files
├── views/                 # HTML page templates
├── docs/                  # Comprehensive documentation
├── scripts/              # Utility scripts
└── package.json          # Dependencies and scripts
```

## API Endpoints

### Data Upload (CHPC Only)
- `POST /api/upload/:dataType` - Upload weather data (API key required)

### Public Data Access
- `GET /api/static/{filename}` - Fetch uploaded data files
- `GET /api/filelist.json` - List available data files
- `GET /api/live-observations` - Current weather observations

## Development Workflow

### Adding New Pages
1. Create HTML file in `/views/`
2. Create matching CSS file in `/public/css/`
3. Create JavaScript module in `/public/js/`
4. Add navigation in `loadSidebar.js`
5. Add route in `server.js` if needed

### Adding New Data Types
1. Define schema in `docs/DATA_SCHEMA.md`
2. Add upload endpoint in `server/routes/dataUpload.js`
3. Create processing function
4. Add fetch function in `/public/js/api.js`
5. Create display component
6. Add to refresh cycle

### CSS-HTML Mapping
The project follows a consistent naming pattern:
- `fire.html` ↔ `fire.css`
- `aviation.html` ↔ `aviation.css`
- etc.

## Features

### Interactive Maps
- Real-time weather station markers
- Color-coded by measurement values
- Popup information windows
- Mobile-friendly zoom and pan

### Data Visualizations
- Time series charts for historical trends
- Multi-variable plotting capabilities
- Responsive chart layouts
- Export functionality

### Responsive Design
- Mobile-first approach
- Percentage-based layouts
- Touch-friendly interface
- Optimized for various screen sizes

### 90s Mode
- Iridescent holographic backgrounds
- Sparkle animations
- Retro color schemes
- Toggle on/off functionality

## Documentation

Comprehensive documentation is available in the `/docs/` directory:

- **[CLAUDE.md](docs/CLAUDE.md)** - Complete project context and overview
- **[DATA_SCHEMA.md](docs/DATA_SCHEMA.md)** - Data structure and format specifications
- **[IMPROVEMENTS.md](docs/IMPROVEMENTS.md)** - 20 improvement items and roadmap
- **[frontend-architecture-README.md](docs/frontend-architecture-README.md)** - Frontend patterns and organization
- **[javascript-patterns-README.md](docs/javascript-patterns-README.md)** - JavaScript best practices and gotchas
- **[api-key-setup-README.md](docs/api-key-setup-README.md)** - API configuration guide
- **[SSL_SETUP.md](docs/SSL_SETUP.md)** - SSL configuration for production
- **[winter-ozone-science-README.md](docs/winter-ozone-science-README.md)** - Scientific background

## Contributing

This is a collaborative 4-person team project. When contributing:

1. Follow existing code patterns and conventions
2. Test changes thoroughly using `npm run dev`
3. Update documentation for significant changes
4. Use the established CSS-HTML naming convention
5. Consider mobile responsiveness in all UI changes

### Known Areas for Improvement
- Multiple CSS files with similar styles (see IMPROVEMENTS.md)
- Console.log statements throughout codebase
- Unused code and images that can be cleaned up
- TODO comments for unfinished features

## Testing

### Manual Testing
```bash
# Start development server
npm run dev

# Test API endpoints (requires additional dependencies)
# npm install node-fetch form-data --save-dev
npm run test-api

# Manual API test example (when server is running)
curl -X POST http://localhost:3000/api/upload/observations \
  -H "x-api-key: your_api_key" \
  -F "file=@example_data.json"
```

### Example Data
Sample data files are available in `/public/api/static/` for testing and development.

## Team

Developed by the **Bingham Research Center** team:
- 4-person collaborative development team
- Focus on air quality research and meteorological visualization
- Clean codebase with minimal redundancy principles

## License

[License information to be added]

---

For detailed technical information, troubleshooting, and advanced configuration, please refer to the comprehensive documentation in the `/docs/` directory.