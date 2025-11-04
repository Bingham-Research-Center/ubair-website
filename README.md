# Uintah Basin Air Quality Website

## Overview

Real-time weather data visualization and air quality monitoring platform for the Uintah Basin region of Utah, driven by needs of residents, researchers, and policymakers. The project is still developmental, is not yet purged of AI slop, and should be treated with caution. **The use of AI like Claude and Codex CLI agents is/must always be documented transparently** via `git` authorships etc. We are all still learning, and we ask you do not judge too harshly our codebase whilst in flux. The team lead John Lawson oversees all website updates and [welcomes feedback](mailto:john.lawson@usu.edu). All products on BasinWx are currently experimental: do not use them for critical decision-making.

**Live Site:** [basinwx.com](https://basinwx.com)

## Features (_gradual introduction in November 2025_)

- **Real-time Observations**: live weather and air-quality data year-round
- **Ozone Alert outlooks**: human-written forecasts of wintertime ozone.
- **Clyfar**: Our in-house model, Welsh for "wise", provides guidance for outlooks
- **AQ and Wx Forecasts**: Weather-model forecasts and air-quality predictions
- **Road Conditions**: using UDot data
- **AI-generated overviews**: we are testing plain-language risk communication
- **Mobile Responsive**: Optimized for devices large and small.

## Human-to-human warnings
- This codebase moves fast, and repo bloat is a problem. Ideally,
  - We encourage low verbosity
  - We prune outdated content and combine overlapping files
  - We embrace transparent, ethical use of AI during development
  - This means always co-authoring `git commit`s to own your code!

## Technical Architecture

```
CHPC (Data Processing) → API Upload → Akamai Server → Web Interface
```

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript, Leaflet, Plotly.js
- **Data Pipeline**: Python (brc-tools), Synoptic Weather API
- **Deployment**: Akamai CDN, SSL/TLS secured

## Documentation --- still in flux and requiring review for AI slop

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

## Roadmap & To-Dos

### Near-term (2025)
- [ ] Forecast evaluation
- [ ] LLM-powered data interpretation
- [ ] Stability testing as `beta` becomes `ops`.
- [ ] Consistently pleasing mobile interface

### Mid-term (2026)
- [ ] Review of feedback
- [ ] Improvements to forecast models
- [ ] Further road-weather, aviation, and recreation focus

### Next year's winter (2026/2027)
- [ ] Interactive Q&A chatbot for weather queries
- [ ] Experimental data and models
- [ ] Educational, interactive data visualizations
- [ ] Regional expansion where warranted (e.g. Wyoming; Wasatch Front)
## Contributing

We welcome contributions; guidelines will come soon for:

- Code style standards
- Testing requirements
- Pull-request (BR) process
- Bug reporting and/or troubleshooting
- Working with GitHub CoPilot effectively

## Data Sources

- **Synoptic Data**: Real-time meteorological observations compiling multiple sources (e.g., EPA, DAQ, Union Pacific, etc)
- **UBAIR Sensors**: Research-grade monitoring equipment maintained by Trevor O'Neil and Seth Lyman here at the Bingham Research Center
- **NOAA weather models**: The Federal data are [freely available](https://www.nco.ncep.noaa.gov/pmb/products/gens/) and _crucial_ drivers of most weather and air-quality information shown on BasinWx.
- **Utah Department of Transportion**: Road conditions are provided under fair-use limits for advisory use only: for critical decision, go to [UDoT](https://udottraffic.utah.gov) for vetted, expanded information.
- (TBC: Ouray vertically-pointing radar)
- (TBC: Satellite imagery)

## Team

Find more information at [our team site](https://jrl.ac/team), but our primary developers are:
- Dr. John R. Lawson (lead)
- Michael Davies (undergraduate RA)
- Elspeth Montague (former high-school RA)
- Luke Neilson (currently onboarding; high-school RA)
- TBC 1 - high-school RA
- TBC 2 - high-school RA
- TBC 3 - high-school RA

## Acknowledgments

- Research funding for air-quality projects provided by **Uintah County Special Service District 1** and the **Utah Legislature**
- University of Utah CHPC for computational resources
- Synoptic Weather for kindly permitting access to archived and live data
- Brian Blaylock, Alex Jacques, John Horel, and many more academics who assisted with development
- You! The user and Uintah Basin community! Thanks for coming!

## Contact

Other than JRL's [email address](mailto:john.lawson@usu.edu), further information or feedback can be found here:
- Team "Spotlight" posts [for plain-language team blog posts](https://jrl.ac/blog).
- Ozone Alert program for receiving email outlooks when there is a elevated risk of **high wintertime ozone** in the Uinta Basin.
- GitHub Issues: [Report bugs or request features (more for the tech-minded)](https://github.com/bingham-research-center/ubair-website/issues)
---

