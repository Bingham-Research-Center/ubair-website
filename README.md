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

## Look and feel (theme)
Every colour, corner radius, shadow and font is defined once, in `public/css/theme/tokens.css`.
Page stylesheets read those tokens with `var(--…)` and add no raw values of their own, so
changing the site's look is an edit to that one file.

| To | Do this |
|---|---|
| Style something in page CSS | use the semantic names: `var(--color-text-muted)`, `var(--radius-md)`, `var(--shadow-card)`, `var(--font-sans)`; never a hex or px literal |
| Give one page or card its own accent | set `--page-accent` on `body[data-page-type="…"]`, or `--card-accent` on the card |
| Change the look of the whole site | edit values in `tokens.css`, nothing else |
| Check you kept to it | `npm test`: `styleRatchet` fails if a file gains raw values, `themeContrast` fails if text drops below WCAG AA |

House rules for new work: flat surfaces separated by a hairline rather than a drop shadow;
corners of 4, 6 or 8 px; hover and keyboard focus change colour or border and never move the
element; icons come from the one vendored Font Awesome (`/vendor/fontawesome`), not emoji or a
CDN. Tiers, the ratchet and how to add a token: `docs/STYLE-TOKEN-GUIDE.md`.

**Branch previews carry the theme with them.** A preview at `<name>.basinwx.dev` is one
developer's PR branch running from its own worktree on the dev box
(`docs/howto/preview-a-branch.md`; each new subdomain also needs a certificate and an nginx
vhost, which only root can add). Every page loads `tokens.css` through `main.css`, so a branch
that is current with `dev` shows the current theme with no extra work, and a branch that edits
`tokens.css` previews its own look. To compare several looks on one preview, put each
candidate's values in an `html[data-theme="name"]` block in a preview-only stylesheet and
switch the attribute. Keep that off `dev`: `styleRatchet` fails if the switcher is present.

## Documentation
| Audience | Start here |
|---|---|
| **Human devs** | [Project wiki](https://github.com/Bingham-Research-Center/ubair-website/wiki) — one page: what to work on and how a change gets merged |
| **AI agents** | `CLAUDE.md` (root, auto-loaded) → `docs/AGENT-INDEX.md` |
| **Operators** | `docs/DEPLOYMENT.md` (bring-up, certs, firewall, gotchas) |
| **Styling** | `docs/STYLE-TOKEN-GUIDE.md` (tokens, the style ratchet); summary under "Look and feel" above |
| **Data pipeline** | `docs/DATA-PIPELINE-OVERVIEW.md` + `DATA_MANIFEST.json`; producer side in [brc-tools](https://github.com/Bingham-Research-Center/brc-tools) |
| **Per-feature SOPs** | `docs/SOP-*.md`, `docs/howto/*.md` |

Outstanding work is tracked in [GitHub Issues](https://github.com/Bingham-Research-Center/ubair-website/issues)
on two milestones (`v1.6.0 Beta relaunch`, `v2.0.0 Ozone season open`), not in docs files.
Unscheduled ideas live in one thread, [Ideas parking lot](https://github.com/Bingham-Research-Center/ubair-website/discussions/342).

## Contributing
Three audiences: human devs (architecture, setup, workflow), end users (plain-language guides),
and AI agents (`CLAUDE.md`, schemas, system context). Keep docs terse, current, and
audience-appropriate. PRs go into `dev`.

- **Style:** low verbosity; prune bloat
- **Tests:** TDD where practical (`npm test`)
- **AI authorship:** every commit involving AI assistance must list the agent as a co-author
- **Branches:** never push directly to `dev`/`ops`/`main` — see `CLAUDE.md` and the wiki

## Quick health checks
```bash
scripts/probe.py                                    # both boxes: cert, version/commit, ingest, freshness
curl -s https://www.basinwx.com/api/health/ingest   # 200 = uploads landing; 503 + reasons otherwise
curl -s https://www.basinwx.com/api/live-observations | jq '.totalObservations'
pm2 logs ubair-site --lines 50 --nostream           # on prod, as root
pm2 logs basinwx-dev --lines 50 --nostream          # on dev, as deploy
```

A green `/api/health` only says the box answers; `/api/health/ingest` says uploads can land.
After a reboot, check that pm2 holds the port (`docs/DEPLOYMENT.md` §6.2a, §8).

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
- Derek Meanea (UX/UI, video)
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
