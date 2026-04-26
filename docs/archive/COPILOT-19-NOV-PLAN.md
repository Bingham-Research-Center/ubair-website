# Stakeholder Demo Preparation Plan
**Date:** 19 November 2025  
**Time Available:** 2 hours  
**Goal:** Maximum stability, acceptable placeholders for beta demo

---

## Priority 1: Critical Demo Blockers (90 minutes)

### Issue #84: Homepage Key Stations & Auto-Loop Popup
**Estimated Time:** 45 minutes

#### Phase 1: Station Inventory (15 min)
- [ ] Access legacy ubair.usu.edu site (archive.org if needed)
  - [ ] Document station IDs displayed on old homepage
  - [ ] Note station names, locations, and order
  - [ ] Screenshot legacy layout for reference
- [ ] Check current homepage station configuration
  - [ ] View `/views/index.html` or main template
  - [ ] Inspect `/public/js/` for station hardcoding
  - [ ] Compare against legacy list

#### Phase 2: Station Implementation (15 min)
- [ ] Identify missing stations from current homepage
  - [ ] Add missing station IDs to config/data
  - [ ] Verify stations exist in `/api/live-observations`
  - [ ] Update frontend to display all key stations
- [ ] Test station display
  - [ ] Run `npm run dev`
  - [ ] Verify all stations render correctly
  - [ ] Check mobile responsiveness

#### Phase 3: Auto-Loop Popup Fix (15 min)
- [ ] Locate popup auto-loop code
  - [ ] Search for `setInterval`, `setTimeout` in popup scripts
  - [ ] Check `public/js/` for modal/popup logic
- [ ] Cross-browser testing
  - [ ] Test in Chrome (primary)
  - [ ] Test in Firefox
  - [ ] Test in Safari
  - [ ] Note any browser-specific issues
- [ ] Fix or document workaround
  - [ ] Implement fix if simple (< 10 min)
  - [ ] Otherwise: add graceful fallback/manual controls

---

### Issue #85: Air Quality Live Data Pipeline (45 minutes)

#### Phase 1: Diagnostic (15 min)
- [ ] Check local data freshness
  - [ ] List files in `public/api/static/observations/`
  - [ ] Check timestamps: `ls -lth public/api/static/observations/`
  - [ ] Test endpoint: `curl http://localhost:3000/api/live-observations`
- [ ] Review CHPC documentation
  - [ ] Check `chpc-deployment/` for cronjob config
  - [ ] Review `README-PIPELINE.md` for data flow
  - [ ] Check `PIPELINE-STATUS.md` for known issues

#### Phase 2: CHPC Investigation (20 min)
- [ ] SSH to CHPC server (if accessible)
  - [ ] Run: `crontab -l` to list scheduled jobs
  - [ ] Check cronjob logs: `tail -100 /path/to/cronjob.log`
  - [ ] Verify Python script execution: `ps aux | grep python`
- [ ] Test data upload manually
  - [ ] Run CHPC upload script manually: `python scripts/upload_data.py`
  - [ ] Check for API errors or network issues
  - [ ] Verify data appears on Akamai server

#### Phase 3: Quick Fixes (10 min)
- [ ] If cronjob is broken:
  - [ ] Restart cron service: `systemctl restart cron`
  - [ ] Fix cron syntax if malformed
  - [ ] Test immediate execution
- [ ] If API endpoint broken:
  - [ ] Check `server/routes/` for `/api/live-observations`
  - [ ] Verify file path references are correct
  - [ ] Check for permission issues
- [ ] Fallback: Use most recent cached data
  - [ ] Copy latest good data to "current" symlink
  - [ ] Add timestamp disclaimer to UI

---

## Stretch Goal: Multi-Channel Data Architecture (30 minutes)

### Issue #86: Synoptic Weather Data Quality Channels
**Note:** This is primarily planning/research, not implementation

#### Microtask 1: Research Phase (10 min)
- [ ] Review Synoptic Weather API documentation
  - [ ] Check for existing quality flags/metadata
  - [ ] Look for `qc_flag`, `status`, or `channel` parameters
  - [ ] Document current API response structure
- [ ] Check existing pipeline code
  - [ ] Review `chpc-deployment/` Python scripts
  - [ ] Look for quality control logic in data processing
  - [ ] Note where to inject channel metadata

#### Microtask 2: Architecture Design (10 min)
- [ ] Define channel specifications
  - [ ] **Raw:** Direct sensor output, no QC
  - [ ] **Corrected:** Real-time QC applied (spike detection, range checks)
  - [ ] **Official:** Post-processed truth dataset (delayed upload)
- [ ] Sketch data flow
  - [ ] API response → channel tagging → JSON storage
  - [ ] Frontend: channel selector UI mockup
  - [ ] Database schema (if needed for channel history)

#### Microtask 3: Contact & Documentation (10 min)
- [ ] Draft email to Synoptic Weather support
  - [ ] Explain use case (research + operational)
  - [ ] Request multi-channel support or workaround
  - [ ] Ask about metadata standards
- [ ] Document in `docs/`
  - [ ] Create `MULTI_CHANNEL_SPEC.md`
  - [ ] Outline implementation steps for December
  - [ ] Add to `PYTHON-DEVELOPER-TODO.md`

---

## Even Stretchier Goal: NWP (Numerical Weather Prediction) (60+ minutes)

### Issue #87: HRRR/GEFS Weather Forecast Visualization
**Note:** This is aggressive for 2-hour sprint, focus on groundwork

#### Microtask 1: Code Inventory (15 min)
- [ ] Find existing HRRR notebooks
  - [ ] Search: `find . -name "*.ipynb" | xargs grep -l "HRRR\|Herbie"`
  - [ ] Review `references/` directory
  - [ ] Check `scripts/` for any model-fetching code
- [ ] Document Herbie usage patterns
  - [ ] Note which HRRR variables are fetched
  - [ ] Check domain/grid configurations
  - [ ] Identify useful code snippets for production

#### Microtask 2: Data Pipeline Prototype (20 min)
- [ ] Create HRRR fetch script skeleton
  - [ ] New file: `scripts/fetch_hrrr_data.py`
  - [ ] Import Herbie package
  - [ ] Define target variables (temp, wind, precip, ozone precursors)
  - [ ] Set Uintah Basin geographic bounds
- [ ] Test Herbie on local machine
  - [ ] Install: `pip install herbie-data`
  - [ ] Fetch sample HRRR forecast
  - [ ] Convert to JSON format for website
  - [ ] Save to `public/api/static/forecasts/`

#### Microtask 3: Visualization Planning (15 min)
- [ ] Design forecast UI mockup
  - [ ] Sketch layout: map view vs. time series
  - [ ] Choose visualization library (Plotly.js already available)
  - [ ] Plan for multi-variable display (temp, wind, precip)
- [ ] Identify integration points
  - [ ] Create new page: `views/weather-forecast.html`
  - [ ] Add nav link to existing header
  - [ ] Plan API endpoint: `/api/forecast/:model/:timestamp`

#### Microtask 4: LLM Summary Exploration (10 min)
- [ ] Research LLM integration options
  - [ ] OpenAI API for GPT-4 summaries
  - [ ] Local model (Llama, Mistral) for privacy
  - [ ] Prompt engineering: "Summarize HRRR forecast for Uintah Basin"
- [ ] Plan data → text pipeline
  - [ ] Extract key forecast values (highs/lows, wind speed, precip)
  - [ ] Format as structured prompt
  - [ ] Generate plain-language narrative
  - [ ] Display alongside technical visualizations

---

## Quick Wins (If Time Remains)

### Smoke Testing (15 min)
- [ ] Test critical user paths
  - [ ] Homepage loads → stations display
  - [ ] Click through to each major page
  - [ ] Verify no console errors (F12)
  - [ ] Test on mobile device or responsive mode
- [ ] Check for embarrassing bugs
  - [ ] Broken images/links
  - [ ] Typos in visible text
  - [ ] Layout breakage at common screen sizes

### Polish for Demo (10 min)
- [ ] Add loading states for slow data
  - [ ] Spinner or "Loading..." text
  - [ ] Graceful error messages
- [ ] Hide debug elements
  - [ ] Remove or comment out `console.log` statements
  - [ ] Disable any dev-mode banners
- [ ] Verify favicon and branding
  - [ ] Correct favicon displays
  - [ ] Logo is centered and crisp

---

## Post-Demo TODO
- [ ] Commit all changes to `dev` branch
- [ ] Create PR to `main` if demo-ready
- [ ] Update `PIPELINE-STATUS.md` with findings
- [ ] Schedule follow-up for Issues #86 and #87
- [ ] Collect stakeholder feedback in new issue

---

**Remember:** Placeholders are acceptable! Better to have a working demo with "Coming Soon" sections than broken features.
