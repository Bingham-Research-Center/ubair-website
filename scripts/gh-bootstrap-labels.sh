#!/usr/bin/env bash
# Idempotent label bootstrap for the BasinWx winter 2026/27 taxonomy.
# Usage: scripts/gh-bootstrap-labels.sh [-R owner/repo] [--delete-old]
# Renames keep issue history; creates use --force so re-runs are safe.
set -euo pipefail
REPO="Bingham-Research-Center/ubair-website"; DELETE_OLD=0
while [ $# -gt 0 ]; do case "$1" in -R) REPO="$2"; shift 2;; --delete-old) DELETE_OLD=1; shift;; *) echo "unknown arg $1"; exit 2;; esac; done
have() { gh label list -R "$REPO" --limit 200 --json name -q '.[].name' | grep -qx -- "$1"; }
rename() { # old new color description
  if have "$1" && ! have "$2"; then gh label edit "$1" --name "$2" --color "$3" --description "$4" -R "$REPO"; echo "renamed $1 -> $2";
  else gh label create "$2" --color "$3" --description "$4" --force -R "$REPO" >/dev/null; echo "ensured $2"; fi; }
create() { gh label create "$1" --color "$2" --description "$3" --force -R "$REPO" >/dev/null; echo "ensured $1"; }

rename "bug"              "type:bug"      d73a4a "Something is wrong on a live site"
rename "enhancement"      "type:feature"  a2eeef "New user-visible capability"
rename "documentation"    "area:docs"     5319e7 "docs/, wiki, CLAUDE.md"
rename "aesthetics-ux"    "type:design"   faad8a "Visual/UX spec, mockup or copy; deliverable is an artefact, not code"
rename "data quality"     "area:data"     5319e7 "Ingest, DATA_MANIFEST, brc-tools contract"
rename "good first issue" "student-ready" 0e8a16 "Meets the student-ready checklist (wiki > Definition of Done)"
create "mobile"           1d76db "Cross-cutting: behaviour at 375px"
create "type:chore"       cfd3d7 "Refactor, cleanup, deps, CI; no user-visible change"
create "type:epic"        3e4b9e "More than 8h; has child issues; tracks a milestone goal"
create "area:homepage"    1d76db "/ dashboard, tiles, summary tabs"
create "area:live-map"    1d76db "/live_aq Leaflet map, legend, markers"
create "area:ozone-alert" 1d76db "/forecast_outlooks human-written outlooks"
create "area:clyfar"      1d76db "/forecast_air_quality ensemble page"
create "area:roads"       1d76db "/roads, UDOT, cameras, snow detection"
create "area:weather"     1d76db "/forecast_weather"
create "area:sports"      1d76db "/sports"
create "area:aviation"    1d76db "/aviation"
create "area:agriculture" 1d76db "/agriculture, frost"
create "area:water"       1d76db "/water, lakes"
create "area:about"       1d76db "/about/*, disclaimers, acknowledgements"
create "area:nav-ux"      1d76db "Sidebar, dropdowns, cross-page CSS, mobile layout"
create "area:ops"         5319e7 "Boxes, pm2, nginx, release train, monitoring"
create "copilot-ok"       6f42c1 "Safe for the Copilot coding agent: single concern, testable, no ingest or secrets"
create "needs-ux-review"  fbca04 "Request Derek's by-eye review on the preview URL"
create "needs-decision"   e99695 "Blocked on a JRL/PI decision, not on work"
create "blocked"          b60205 "Blocked on another issue, data or person; say which in a comment"
create "swept-2026-09"    ededed "Closed in the Sept 2026 backlog sweep; comment to reopen"

if [ "$DELETE_OLD" = 1 ]; then
  for l in "help wanted" duplicate invalid question wontfix performance pipedream science; do
    have "$l" && gh label delete "$l" --yes -R "$REPO" && echo "deleted $l" || true
  done
fi
