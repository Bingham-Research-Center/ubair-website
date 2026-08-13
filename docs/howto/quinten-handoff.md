# Handoff: Quinten Baldwin — sports page work on BasinWx

**Intended reader:** an LLM-driven task manager (or future agent) helping John Lawson supervise Quinten's work. This file is scratch — not tracked by git, not part of the repo.

## Who

- **Quinten Baldwin** — GitHub `QuintenBaldwin`. Undergraduate / junior contributor on the BasinWx team.
- **Focus:** the sports-oriented weather page on `basinwx.com` / `basinwx.dev`. Translates live meteorology into plain-language outputs useful for outdoor sports (wind influence on baseball/football, dew point comfort, perceived temperature). Target audience: Uintah Basin residents and visitors making recreation decisions.
- **Branch:** `feature/braxton-sports` (branch name is historical and slightly misleading — the code is Quinten's; "braxton" was the original author handle before Quinten took it over). John has confirmed Quinten is the current owner.

## What's in-flight

**PR #128 — "Early sports page"** (open, mergeable, blocked only by protected-branch rule).
- Base: `dev`. Head: `feature/braxton-sports`. Author: QuintenBaldwin.
- 23 commits, ~1135 lines across 8 files ahead of `dev`:
  - `views/sports.html` (213 lines) — page skeleton
  - `public/js/sports.js` (196) — client logic, API integration, perceived temperature, wind display
  - `public/css/sports.css` (201) — card styling, color system
  - `public/js/easter-eggs.js` (+194) and `public/css/easter-eggs.css` (+84) — peripheral UI touches
  - `public/partials/sidebar.html` (+1) — nav entry for `/sports`
  - `server/server.js` (+6) — sports route
  - `docs/Ideas For Sports Page/Sports ideas` (+242) — design notes / brainstorm (note: unconventional path, worth flagging in review)
- Recent progression (tail of branch log): dew-point card, card color polish, wind-influence calculators (baseball + football, switched to imperial units, formula iterations), wind direction display, API integration.
- Last `dev → branch` sync: via PR #180 (recent). So he's not stale against `dev`.

## What's merged already

- Older Quinten commits are already in `dev`: footer-year fixes, `loadFooter.js` additions, smooth color transitions for footer/sidebar-disclaimer, `quinten-changes` merges from earlier PRs. These are unrelated to the sports page.

## What's NOT merged and relevant

- **PR #128 itself** — pending John's review + merge. Nothing blocking on CI; it's just awaiting the human pass.
- **The `PREVIEW_MODE` gate** from PR #182 (landed in `dev` on 2026-04-24, commit `e47f2b3`) is NOT yet in `feature/braxton-sports`. Until Quinten opens another `dev → feature/braxton-sports` sync PR, any preview of his branch will double-poll UDoT and double-send report emails. Workaround documented in `docs/DEPLOYMENT.md` §9 and `docs/howto/preview-a-branch.md`: blank `UDOT_API_KEY=` and set `REPORT_EMAIL_ENABLED=false` in the preview's `.env`.

## New infrastructure Quinten can use today

- PR #182 (merged 2026-04-24) adds per-user preview apps on subdomains of `basinwx.dev`.
- `preview-apps.json` already has an entry for him: `quinten` → `feature/braxton-sports` → port 3002 → subdomain `sports`.
- He can spin up `sports.basinwx.dev` via `scripts/manage-previews.sh up quinten` on the dev box, with the workaround above.
- Walkthrough tailored for him and future juniors: `docs/howto/preview-a-branch.md` (new, 2026-04-24).

## Working style notes for the task-manager

- John collaborates with Quinten in a mentor-style pattern: frequent small iterations, plain-language framing, tolerance for in-progress work. Suggestions should be constructive and avoid heavy refactor demands on single PRs.
- John prefers **tradeoff-framed options** over single decreed plans (see his planning-style memory). Any guidance surfaced to him about Quinten's work should usually present 2–3 options with clear tradeoffs.
- Co-authoring `git commit`s when AI agents help is an explicit team rule (`README.md`, `CLAUDE.md`). If the task manager drafts commits or guidance for Quinten, remind him of this pattern.
- Repo bloat is a declared concern. When recommending new docs or files, prefer adding a single focused doc (like `docs/howto/preview-a-branch.md`) over a sprawling scaffold.

## Likely next-step topics for a Quinten 1:1

1. **Review + merge PR #128** — biggest lever. 23 commits queued; no CI blockers.
2. **Sync `dev` into his branch** before / after the preview demo, so `PREVIEW_MODE` works natively.
3. **Move `docs/Ideas For Sports Page/Sports ideas`** to a conventional filename/path (`docs/sports-ideas.md` or similar) during review.
4. **Demo `sports.basinwx.dev`** hands-on — first real use of the preview-apps infrastructure.
5. **Next feature ideas on the sports page** — his own direction, e.g. more sport-specific weather adapters, accessibility pass, integration with Clyfar output.

## Key references

- Repo: `github.com/Bingham-Research-Center/ubair-website`
- Deployment runbook: `docs/DEPLOYMENT.md` (§9 for previews)
- Junior-dev preview guide: `docs/howto/preview-a-branch.md`
- CLAUDE.md (agent context): top-of-repo
- Data contract: `DATA_MANIFEST.json`
- Team memory (on John's agent): `/home/deploy/.claude/projects/-srv-ubair-website/memory/MEMORY.md`

_Last updated: 2026-04-24 by Claude Opus 4.7 (1M context), writing from the feat/user-preview-apps wrap-up session immediately after PR #182 merge (commit `e47f2b3`)._
