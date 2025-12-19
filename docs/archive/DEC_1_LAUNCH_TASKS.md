<!-- NOTE: This documentation is scheduled for migration to brc-sop Wiki/Filebase. See: https://github.com/Bingham-Research-Center/brc-sop/issues/1 -->

# December 1 Launch Tasks

**Team Huddle Reference - November 21, 2025**

This list shows all open tasks for our December 1 launch, organized from simplest to most complex. Each task includes what you need to know and where to start.

---

## Getting Started (Easiest Tasks)

### #98: Remove test ozone warning from front page
**What it is:** The homepage shows fake test data that will confuse real users.

**Your job:**
- Find where the test warning appears on the homepage
- Remove it or replace with "Coming soon" placeholder
- Test the homepage to make sure it looks clean

**Skills needed:** Basic HTML/JavaScript editing

**Files to check:** `/views/index.html` or `/public/` homepage files

---

### #95: Update disclaimers for public launch
**What it is:** Our disclaimers are outdated. We need strong warnings so people don't make bad decisions using experimental data.

**Your job:**
- Find existing disclaimer text on the website
- Update it to emphasize experimental status
- Add specific disclaimer for UDoT road data on `/roads` page
- Check all main pages have visible disclaimers

**Skills needed:** Basic HTML editing, writing clear warnings

**Files to check:** Footer, homepage, `/views/roads.html`

---

### #12: Fix "Add to Dock" iOS icon
**What it is:** When people save our website to their phone's home screen, it shows an ugly default icon.

**Your job:**
- Research how to set custom icons for websites (called "favicons" and "web app manifest")
- Find or create a nice icon for BasinWx
- Test on as many devices as possible (iPhone, Android, different browsers)

**Skills needed:** Basic web research, HTML editing

**Files to check:** `/public/favicon.ico`, `/public/manifest.json`

**Note:** Luke is already researching this - check with him first!

---

### #92: Review Q&A/info pages
**What it is:** Our "more info" pages need cleanup. They should give quick technical overviews, not replace what's already on the main pages.

**Your job:**
- Look at all Q&A and info pages on the website
- Delete or combine redundant content
- Keep only brief technical explainers (like "How Clyfar works")
- Make sure it's plain language, not jargon-heavy

**Skills needed:** Reading comprehension, content editing

**Files to check:** Any pages with "info", "FAQ", or "about" in the name

---

## Moderate Tasks (Some Technical Work)

### #71: Fix legend and variable visibility on Road Weather mobile view
**What it is:** On phones, the road weather page's legend (the key showing what colors mean) is hard to see or broken.

**Your job:**
- Open the `/roads` page on a phone or tablet
- Find what's wrong with the legend display
- Fix the CSS or layout so it works on small screens
- Test on multiple screen sizes

**Skills needed:** CSS, responsive design basics

**Files to check:** `/views/roads.html`, `/public/css/roads.css`

---

### #101: Fix mobile UI overflow on Weather Forecast page
**What it is:** On mobile, parts of the weather forecast page spill off the screen or overlap weirdly.

**Your job:**
- Open the weather forecast page on a phone
- Find which UI elements are breaking
- Fix the CSS so everything fits properly
- Test on iOS and Android

**Skills needed:** CSS, responsive design

**Files to check:** `/views/weather.html`, CSS files

**Note:** Michael knows the status - ask him before starting!

---

### #52: Fix snow plow route display bug
**What it is:** Snow plow routes show up behind road condition lines and don't align with actual roads.

**Your job:**
- Look at the `/roads` page
- Find the code that draws snow plow routes on the map
- Fix the layering (z-index) so routes appear correctly
- Align routes better with road data

**Skills needed:** JavaScript, Leaflet maps library basics

**Files to check:** `/public/js/roads.js` or similar map code

---

### #57: Create GitHub Wiki with Team SOPs
**What it is:** We need a Wiki (like a mini-website for documentation) with instructions for the team.

**Your job:**
- Wait for John to initialize the Wiki (he has to do this manually on GitHub)
- Once it's ready, help write Standard Operating Procedures (SOPs)
- Topics: how to commit code, how to test changes, who to ask for help

**Skills needed:** Writing clear instructions, team communication

**Where:** GitHub Wiki tab (not in the code)

---

## Advanced Tasks (Technical Experience Helpful)

### #84: Ensure homepage displays key stations from legacy site
**What it is:** The old website (ubair.usu.edu) showed specific important weather stations. Our new homepage should show the same ones.

**Your job:**
- Find the list of key stations from the old site
- Check if they appear on our new homepage map
- Fix any missing stations
- Test that station popups work correctly

**Skills needed:** JavaScript, understanding JSON data files

**Files to check:** `/public/api/static/` data files, homepage map code

---

### #99: Web server - Implement hourly data pruning
**What it is:** Our server collects weather data files every hour. Old files pile up and waste space. We need to automatically delete files older than 24 hours.

**Your job:**
- Write a script (Node.js or bash) that deletes old JSON files
- Keep only the last 24 hours of data
- Set it to run automatically every hour (cron job)
- Test on development data first

**Skills needed:** Bash or Node.js, understanding cron jobs, file system operations

**Files to work on:** Create new script in `/scripts/` folder

**Target folder:** `/public/api/static/{observations,metadata}/`

---

### #100: CHPC - Implement daily data archival
**What it is:** On our compute server (CHPC), we need to save all generated data files to long-term storage once a day.

**Your job:**
- Write a Python or bash script that moves files to archive storage
- Run it daily via cron job
- Don't send archived files to the web server
- Document how it works

**Skills needed:** Python or bash, CHPC access, understanding file systems

**Files to work on:** Create new script on CHPC side

**Note:** This happens on CHPC, not the web server

---

## Complex Tasks (Team Leads / Experienced Developers)

### #38: Ozone Alert markdown outlook pipeline
**What it is:** John writes ozone forecasts in markdown files. We need a complete pipeline to upload them, display a summary on the homepage, show the full version on the Ozone Alert page, and archive old ones.

**Your job:**
- Figure out where to store outlook markdown files
- Modify the upload API to accept markdown
- Parse markdown to extract summary for homepage
- Display full outlook on Ozone Alert page with archive
- Start issuing real outlooks around Nov 25

**Skills needed:** Node.js, API development, markdown parsing, file handling

**Files to check:** `/server/` API routes, homepage display logic, Ozone Alert page

**Important:** Coordinate with Seth on review workflow before issuing outlooks

---

### #50: Road Weather API usage exceeding limits
**What it is:** We're using UDoT's API too much and hitting rate limits, making the road page slow or broken.

**Your job:**
- Check current API usage stats
- Figure out if we can reduce requests without breaking functionality
- Consider if we need a bigger server to handle caching
- Understand: if we cache on backend, does visitor count still matter?

**Skills needed:** API optimization, caching strategies, server performance

**Files to check:** `/server/` API code for UDoT calls

**Note:** Michael is checking stats - coordinate with him first!

---

### #83: Fix pm2 duplicate processes on ops server
**What it is:** When the production server restarts, pm2 (our process manager) creates duplicate website processes, wasting resources and causing conflicts.

**Your job:**
- Access the production server (ops server)
- Check pm2 configuration and startup scripts
- Fix auto-startup to prevent duplicates
- Test by restarting the server

**Skills needed:** Linux server management, pm2 process manager, debugging

**Where:** Production server (not your local computer)

**Note:** Be very careful - this is the live website!

---

### #85: Air quality pages showing stale data
**What it is:** The air quality pages aren't updating with fresh data. Something is wrong with the CHPC cronjob or upload pipeline.

**Your job:**
- Log into CHPC and check if the cron job is running
- Look at logs to see if uploads are failing
- Test the `/api/live-observations` endpoint
- Fix whatever is blocking fresh data

**Skills needed:** CHPC access, debugging cron jobs, API testing, log analysis

**Commands to try:**
```bash
crontab -l              # See scheduled jobs
systemctl status <job>  # Check job status
tail -f /path/to/logs   # Watch logs live
```

---

### #48: Technical Report - Snow Identification Algorithm
**What it is:** Michael is writing a report about how we detect snow from webcam images.

**Status:** Michael is working on it - check with him about what help he needs.

**Note:** This is documentation, not code. May move to a different milestone.

---

## Key Terms

- **GitHub Issue:** A task or bug we need to fix (like a to-do item)
- **Milestone:** A deadline (Dec 1 launch = "November 2025 Roadmap")
- **CHPC:** University of Utah's compute server where we process data
- **API:** How our website talks to other services or our server
- **Cron job:** A task that runs automatically on a schedule
- **JSON:** Data file format our website uses
- **Mobile responsive:** Website works well on phones/tablets
- **Frontend:** What users see (HTML/CSS/JavaScript)
- **Backend:** Server-side code (Node.js, data processing)

---

## Questions?

- **Stuck on a task?** Ask in team chat or tag John/Michael on the GitHub issue
- **Don't know where to start?** Look for issues labeled "good first issue"
- **Need access to CHPC or servers?** Ask John for credentials
- **Want to learn git/GitHub?** Ask team leads for a quick tutorial

**Next huddle:** We'll assign specific tasks to people and pair up for harder ones.
