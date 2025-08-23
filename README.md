# Uintah Basin Air Quality Website

## Overview

Real-time weather data visualization and air quality monitoring platform for the Uintah Basin region of Utah. This project combines cutting-edge atmospheric science research with modern web technologies to provide accessible, actionable air quality information to residents, researchers, and policymakers.

**Live Site:** [basinwx.com](https://basinwx.com)

## Mission & Vision

Our goal is to democratize access to air quality data and atmospheric science insights for the Uintah Basin community. By combining real-time observations, forecasts, and scientific analysis, we aim to:

- Empower residents with timely air quality information
- Support research into winter ozone formation mechanisms
- Facilitate data-driven policy decisions
- Bridge the gap between atmospheric science and public understanding

## Features

- **Real-time Observations**: Live weather and air quality data from monitoring stations
- **Interactive Maps**: Leaflet-based visualization of spatial data patterns
- **Time Series Analysis**: Plotly.js charts for temporal trends
- **Forecast Integration**: Weather model outputs and air quality predictions
- **Mobile Responsive**: Optimized for all devices
- **Data API**: RESTful endpoints for programmatic access

## Technical Architecture

```
CHPC (Data Processing) → API Upload → Akamai Server → Web Interface
```

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript, Leaflet, Plotly.js
- **Data Pipeline**: Python (brc-tools), Synoptic Weather API
- **Deployment**: Akamai CDN, SSL/TLS secured

## Documentation

- [API Key Setup](docs/API-KEY-SETUP.md)
- [Data Schema](docs/DATA-SCHEMA.md)
- [Frontend Architecture](docs/FRONTEND-ARCHITECTURE.md)
- [Python Developer Guide](docs/PYTHON-DEVELOPER-GUIDE.md)
- [SSL Setup Guide](docs/SSL-SETUP.md)
- [Winter Ozone Science](docs/WINTER-OZONE-SCIENCE.md)

## Research & Publications

### Scientific Papers
- *Coming Soon*: Winter ozone formation mechanisms in the Uintah Basin
- *In Preparation*: Machine learning approaches to air quality forecasting

### Blog Posts & Long-form Articles
- [Understanding Winter Ozone](https://www.jrl.ac/winter-ozone-primer) *(placeholder)*
- [The Uintah Basin's Unique Meteorology](https://www.jrl.ac/basin-meteorology) *(placeholder)*
- [Data Science Meets Atmospheric Chemistry](https://www.jrl.ac/data-science-atmosphere) *(placeholder)*

## Development

### Prerequisites
```bash
node >= 18.0.0
npm >= 9.0.0
```

### Installation
```bash
git clone https://github.com/yourusername/ubair-website.git
cd ubair-website
npm install
```

### Running Locally
```bash
# Development mode with auto-reload
npm run dev

# Test API endpoints
npm run test-api
```

### Environment Variables
```bash
# Create .env file
API_KEY=your-secure-api-key
NODE_ENV=development
PORT=3000
```

## Roadmap & To-Dos

### Near-term (Q1 2025)
- [ ] Model verification dashboard
- [ ] LLM-powered data interpretation
- [ ] Interactive Q&A chatbot for weather queries
- [ ] Enhanced mobile UX

### Mid-term (Q2-Q3 2025)
- [ ] Aircraft observation integration
- [ ] Vertical profile derivations
- [ ] Multi-language support
- [ ] Public API documentation

### Long-term (2025+)
- [ ] Machine learning forecasts
- [ ] Citizen science integration
- [ ] Educational modules
- [ ] Regional expansion

### Technical Improvements
See [IMPROVEMENTS.md](docs/IMPROVEMENTS.md) for detailed technical debt and optimization opportunities.

## Contributing

We welcome contributions from researchers, developers, and community members! Please see our contributing guidelines (coming soon) for:

- Code style standards
- Testing requirements
- Pull request process
- Bug reporting

## Data Sources

- **Synoptic Data**: Real-time meteorological observations
- **MesoWest**: Historical weather data
- **EPA AirNow**: Air quality measurements
- **Custom Sensors**: Research-grade monitoring equipment

## Team

A collaborative effort by atmospheric scientists, software engineers, and data scientists committed to improving air quality understanding in the Uintah Basin.

## License

*License information to be added*

## Acknowledgments

- University of Utah CHPC for computational resources
- Synoptic Data for weather API access
- Uintah Basin community for ongoing support
- Research funding agencies *(details to be added)*

## Contact

For questions, collaborations, or media inquiries:
- Project Website: [basinwx.com](https://basinwx.com)
- Research Blog: [www.jrl.ac](https://www.jrl.ac)
- GitHub Issues: [Report bugs or request features](https://github.com/yourusername/ubair-website/issues)

---

*Advancing atmospheric science through open data and community engagement*