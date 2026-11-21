# Next Session Handoff — Nov 21

Where things stand at the end of 21 Nov 2026, and what comes next, for John and for an agent
starting cold. Rules that last are in `CLAUDE.md`; this file goes stale and is replaced by the
next `*-HANDOFF-*.md`. Check every line against `scripts/probe.py` and `gh` before acting.

## 1. Where things stand

| | Version | Commit | Notes |
|---|---|---|---|
| `dev` → www.basinwx.dev | **1.7.8-dev** | `a0433e3` (#423), `863fa00` (#424, docs), then this docs PR | Code deployed and probed 21 Nov 04:23Z; the docs PRs need no deploy |
| `ops` → www.basinwx.com | **v1.7.0** | `5a845d5` | Prod serves it. Lacks every fix since 1.7.0 |
| `main` | v1.7.0 | | Follows `ops` after each prod deploy |

- **Nothing goes to `ops` until John says so.** On 20 Nov he held the next release (1.8.0)
  until the LLM forecast text is live; on 21 Nov he said to pause before `ops`. The release
  steps are in `CLAUDE.md` ("Versioning & release train"); each merge needs his own OK.
- **Open PRs:** #337, #338, #339, the roads batches B–D, parked for 1.9.0 (Michael's fixes sit
  on `codex/roads-{b,c,d}-review-fixes`); #401, Quinten's draft, to rebase after the NWP work.
- **On the dev box:** worktree `/srv/ubair-website-preview-roads` (the parked roads stack, its
  preview on :3002 not running). The spare preview slot `theme.basinwx.dev` (:3003) is free.
  Local-only branches kept on purpose: `preview/theme` (the look switcher, #355) and
  `rebased/feature/braxton-sports` (Quinten's early sports work).
- **Keep `rebased/roads-a-fallback`** although batch A is merged (#336): it is #337's base.
  Deleting it on 21 Nov closed #337; the branch was restored and #337 reopened. Retarget #337
  at `dev` before deleting it again. Quinten's branches (`pr/128`, `quinten-changes`) stay.

## 2. What happened on 21 Nov

- **The AQ maps were fixed (#423).** Both maps joined the observation feed by display name, so
  stations that shared a town merged: Vernal showed a co-op temperature 14 h old as current,
  and five markers on Live AQ wore a neighbour's ozone. Readings are now keyed by station ID
  (`public/js/config.js` is the station list), shown only while recent (3 h; co-op snow depth
  30 h), and both maps share one colour scheme and a four-line legend. The homepage map is the
  Basin floor only; the passes went (their road colours disagreed with the Roads light).
- **Synoptic audit.** The feed has carried the same 11 ozone monitors since April. Fruitland
  (`QFL`) is active and missing. The UB-AIR monitors (Horsepool, Castle Peak, Seven Sisters)
  have sent nothing to Synoptic since late 2025; the maps say "Not reporting since". John says
  getting them back onto Synoptic is in hand. Producer asks P21–P24 (producer handoff §9).
- **The site's Synoptic token is Utah-only** (see §4).
- **Housekeeping:** 14 merged branches deleted on GitHub and 17 locally, the finished
  `/srv/ubair-website-nwp` and `-aqmap` worktrees removed, milestone `v1.6.0 Beta relaunch`
  closed. Issues: §5.

## 3. Next steps

**On CHPC** (brc-tools), in order. Full text and checks in
[`NWP-PRODUCER-HANDOFF-nov20.md`](NWP-PRODUCER-HANDOFF-nov20.md), grouped by repo since #424:
0. **John: merge brc-tools #76, #77, #78**, then `git pull --ff-only` in `~/gits/brc-tools` on
   notchpeak1 (the crons run from that tree). They add gusts and visibility to the obs feed, fix
   the precipitation totals and rotate HRRR winds to north; then re-read the payload.
1. **P1, P2: the LLM forecast text.** The critical path: 1.8.0 waits on it. The website
   renders a file within minutes of upload; nothing to change on this side.
2. **P21: add Fruitland (`QFL`)** to the observation request. Five minutes, and it appears on
   both maps by itself.
3. P22 (NO and NO2), P23 (drop dead stations from the metadata file), P11–P20 as time allows.
4. **P24 before any third server sends observations:** the maps read only the newest
   `map_obs_*` file, so a second producer must merge into CHPC's file or agree its own prefix.

**On the dev box:**
1. When a real LLM file lands on `.dev`: check the homepage and weather placements, then ask
   John about the 1.8.0 release train.
2. If John wants the Colorado and Wyoming edges before Synoptic answers: a small server-side
   fetch from the keyless sources in §4, cached, keyed by station ID like everything else, and
   measured for cost first (John asks what a feature costs the box).
3. Theme leftovers (#355), roads B–D (1.9.0), the #401 rebase.

**John:** the Synoptic email (§4); the AirNow API key if nearest-ozone is wanted (free).

## 4. The Colorado and Wyoming edges, outside Synoptic

Every request this token makes for Colorado or Wyoming answers "your account does not have
access", Rangely included. Ask Synoptic for (a) Colorado and Wyoming, at least the Rangely,
Dinosaur and south-west Wyoming edge, and (b) whether the UB-AIR network will be restricted
when it returns, since this token would not see a restricted network either. Whether the CHPC
token has the same limit is unknown.

Meanwhile, sources that need no key, each checked live on 21 Nov:

| Source | What it has near the edge | Notes |
|---|---|---|
| aviationweather.gov `/api/data/metar` | **Rangely AWOS `K4V0`**, Meeker `KEEO`, Craig `KCAG`, Rock Springs `KRKS` | METAR every 20 min; the freshest route for K4V0 |
| api.weather.gov `/stations/{id}/observations/latest` | The same airports, RAWS (e.g. `DRAC2`), Douglas Pass RWIS `CO098`, USCRN Dinosaur `DNOC2` | SI with unit codes; needs a User-Agent; lagged K4V0 by 40 min on the day |
| Iowa Environmental Mesonet JSON | Colorado and Wyoming RWIS (pavement temperature, road state), RAWS | Its RWIS comes through MesoWest, so it is Synoptic's data by another road |
| RCC-ACIS, CoCoRaHS export | Daily snow depth and precipitation: Rangely 1E, Rangely 0.6 NNE, Dinosaur | A day behind; fits the co-op snow-depth markers |

**No live air-quality monitor remains in the Colorado or Wyoming box.** The Rangely monitor
(AQS 08-103-0006) stopped in spring 2025, and Meeker, Elk Springs and Lay Peak are inactive. The
nearest live ozone outside Utah is Rifle, through AirNow (API key, free).

## 5. Issues

All 30 open issues were checked against `dev` on 21 Nov, and each close was verified in the
code before it was made.

- **Closed:** #295, #294 (done in #367), #283 (no sidebar dropdowns left), #166 (superseded by
  #406), #146 (fixed in February), #122 (Live AQ auto-cycle; the homepage mismatch was the name
  merge fixed in #423), #316 (folded into #317). That emptied `v1.6.0 Beta relaunch`.
- **Status notes posted:** #413, #412, #408, #406, #355, #307, #306, #291, #253, #168, #144.
- **What is left on `v2.0.0 Ozone season open` (23):**

| Kind | Issues |
|---|---|
| Waits on producer data | #406, #408, #409, #410, #411, #412, #413, #241 |
| Website work, ready to pick up | #307 (dead files), #306 (last unit-conversion copies), #291 (providers on `/about`), #311 (required check), #168 (choose a keep-window first) |
| Roads (Michael; batches B–D are 1.9.0) | #419, #303, #302, #301, #238, #144, #71 |
| Ops and release | #253 (test outlook off both boxes by 30 Nov), #317 (v2.0.0 press assets), #355 (theme leftovers) |

- **For John:** Derek is still assigned on #317 and named as owner on #291, though he no longer
  works on GitHub. Reassign or leave as you prefer.
