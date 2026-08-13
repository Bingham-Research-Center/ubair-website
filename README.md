# Uintah Basin Air Quality Website

Real-time weather and air-quality visualisation for the Uintah Basin, built for residents,
researchers, and policymakers.

> **Live site:** [basinwx.com](https://basinwx.com) (mirror: [basinwx.dev](https://www.basinwx.dev))
>
> The project is still developmental and not yet purged of AI slop — treat with caution. All
> products are experimental; do not use them for critical decisions. Feedback to
> [john.lawson@usu.edu](mailto:john.lawson@usu.edu).

## What's here
- **Real-time observations** — live weather + air-quality, year-round
- **Ozone Alert outlooks** — human-written wintertime ozone forecasts
- **Clyfar** — in-house ensemble model (Welsh "wise") providing outlook guidance
- **Forecasts** — weather-model outputs and air-quality predictions
- **Road conditions** — UDoT data, advisory only (go to [udottraffic.utah.gov](https://udottraffic.utah.gov) for real decisions)
- **AI overviews** — experimental plain-language risk communication
- **Mobile responsive**

## Human-to-human warnings
This codebase moves fast. Repo bloat is a known problem.
- Low verbosity preferred; prune outdated content; merge overlapping files
- AI-assisted development is welcome and **must** be transparent — co-author every `git commit`

## Architecture (one paragraph)
CHPC compute (`brc-tools`, Python) fetches Synoptic + HRRR data, processes via polars/pandas,
POSTs JSON to `/api/upload/:dataType` on **two Linode boxes** (`www.basinwx.com` ops and
`www.basinwx.dev` rehearsal mirror — fan-out from CHPC, not pull). The Node/Express + Leaflet/Plotly
frontend reads from `/api/static/*`. DNS for `.dev` is at Namecheap with a wildcard A record so
feature-branch previews need no DNS work — `scripts/manage-previews.sh` spins them up at
`<name>.basinwx.dev`. Forecast schemas are pinned in `DATA_MANIFEST.json`.

## Documentation
| Audience | Start here |
|---|---|
| **AI agents** | `CLAUDE.md` (root, auto-loaded) → `docs/AGENT-INDEX.md` |
| **Human devs** | `docs/README.md` → `docs/QUICK-START.md` |
| **Operators** | `docs/DEPLOYMENT.md` (bring-up, certs, firewall, gotchas) |
| **Data pipeline** | `docs/DATA-PIPELINE-OVERVIEW.md` + `DATA_MANIFEST.json` |
| **Per-feature SOPs** | `docs/SOP-*.md`, `docs/howto/*.md` |

A current docs triage with consolidation TODOs is in `REVIEW-DOCS-apr27.md` (root).

## Contributing
Three audiences: human devs (architecture, setup, workflow), end users (plain-language guides),
and AI agents (`CLAUDE.md`, schemas, system context). Keep docs terse, current, and
audience-appropriate. PRs welcome. Use GitHub Issues for bugs.

- **Style:** low verbosity; prune bloat
- **Tests:** TDD where practical (`npm test`)
- **AI authorship:** every commit involving AI assistance must list the agent as a co-author
- **Branches:** never push directly to `dev`/`ops`/`main` — see `CLAUDE.md`

## Quick health checks
```bash
curl -s https://basinwx.com/api/live-observations | jq '.totalObservations'
curl -s https://basinwx.com/api/filelist/forecasts | jq 'length'
ssh deploy@www.basinwx.com "pm2 logs --lines 50"
ssh deploy@www.basinwx.dev "pm2 logs --lines 50"
```

If the site appears down: check from a phone hotspot first. `.dev` TLDs trip some campus/ISP
networks (HSTS-preload + SNI filtering); cellular working but wifi not = not the server. Full
triage in `docs/DEPLOYMENT.md`.

## Data sources
- **Synoptic** — real-time meteorological observations (EPA, DAQ, Union Pacific, etc.)
- **UBAIR sensors** — research-grade monitoring maintained by Trevor O'Neil and Seth Lyman at the Bingham Research Center
- **NOAA models** — federal data freely available at the [NCEP product portal](https://www.nco.ncep.noaa.gov/pmb/products/gens/)
- **UDoT** — road conditions under fair-use limits (advisory only)

## Team
[Team page](https://jrl.ac/team). Primary developers:
- Dr. John R. Lawson (lead)
- Michael Davies (undergraduate RA)
- Quinten Baldwin, Braxton Wilcken-Pond (sports & viz contributors)
- Luke Neilson (high-school RA, onboarding)
- Elspeth Montague (former high-school RA)

## Acknowledgments
- Funding: **Uintah County Special Service District 1** and the **Utah Legislature**
- University of Utah CHPC (compute)
- Synoptic Weather (data access)
- Brian Blaylock, Alex Jacques, John Horel, and many other academic collaborators

## Contact
- [john.lawson@usu.edu](mailto:john.lawson@usu.edu) — JRL direct
- [Team blog](https://jrl.ac/blog) — plain-language posts
- [GitHub Issues](https://github.com/Bingham-Research-Center/ubair-website/issues) — bugs and feature requests
- Ozone Alert subscription — email outlooks during elevated risk periods
