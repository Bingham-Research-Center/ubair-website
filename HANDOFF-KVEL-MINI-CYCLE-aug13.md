# HANDOFF — KVEL 17/35 mini-cycle: the website leg

**Status: TEMPORARY** (delete when the acceptance checklist at the bottom passes).
**Created:** 2026-08-13, from a brc-tools session with JRL.
**Companion:** `WEBSITE-BRCTOOLS-HANDOFF-aug13.md` — its §TARGET 2 is **stale** (still shows
`[160, 340]`); this doc corrects it and the PR below fixes it in place.

## Ready-to-paste session prompt

> Read `HANDOFF-KVEL-MINI-CYCLE-aug13.md` at the repo root and execute its "The PR" section:
> branch off up-to-date `origin/dev`, make the five-file change (aviation.js floor fix,
> DATA_MANIFEST 2.0.0 + `hrrr_kvel_crosswind` product entry, changelog entry, TARGET 2
> refresh, IMPROVEMENTS pointer fix), and open a PR to `dev`. Line numbers in the doc were
> verified on commit `6b6d823` — re-grep before editing, don't trust them blindly.

## Why you're here (30 seconds)

The FAA redesignated KVEL (Vernal) runway **16/34 → 17/35** (magnetic 169/349, var 10E →
true headings **179/359**). The producer side is **done and released**: brc-tools PR #59
(in tag **v0.1.1**, pushed) emits `runway_headings_deg: [179, 359]` and series keys
`crosswind_kt_179/_359`, `headwind_kt_179/_359`. "brc-tools releases first" is satisfied.

The website leg is **not done**, and until it ships the KVEL cron stays uninstalled:

1. `public/js/aviation.js` derives column headers with `Math.round(heading/10)` →
   labels **Rwy18 / Rwy36**. Must be `Math.floor` (→ Rwy17 / Rwy35, matching the
   producer's own `heading // 10` labels).
2. `DATA_MANIFEST.json` has **no aviation/crosswind entry at all** (zero grep hits), and
   zero KVEL files have ever been uploaded to `.com` or `.dev` — so this is a first-time
   *add* of the product, not a rename of a published field.

**Decisions locked with JRL 2026-08-13** (don't re-litigate):
- Manifest bump is **MAJOR → 2.0.0** anyway — it's the coordination signal promised in the
  brc-tools #59 commit body, the v0.1.1 tag message, and
  `brc-tools/docs/WEBSITE-INTEGRATION.md:89-96`, and `docs/MANIFEST-GUIDE.md`'s
  field-rename rule arguably applies.
- **No** `runway_designators` field is added to the payload; both sides floor-derive the
  designator from the heading.
- Rehearse with a **one-off manual upload to `.dev`** before dev→ops promotion; the cron
  is installed unpinned only after promotion.

## Start here: branch state (verified 2026-08-13, will drift)

- `git fetch` first. The checkout this doc was written from sat on
  `chore/pipeline-unblockers-aug13` (already merged as PR #193) with **stale refs**
  (local `origin/dev` = 57e07f8; real dev tip was 16e307f via PR #203). Branch off
  **up-to-date `origin/dev`**, never off the parked local branch.
- Remote `ops` = **v1.5.0**, tagged and live, and it **contains the aviation consumer**
  (PR #183, `3beb51b`) — so if KVEL data flowed today, `.com` would render **Rwy18/36**.
  The sequencing below prevents that; don't upload anything before promotion.
- Manifest version on dev was **1.2.0** when this was written. Whatever it is when you
  arrive, the target is **2.0.0**.

**Hazards:**
- `chore/housekeeping-aug13` forks from dev *before* the 1.2.0 manifest bump and still
  carries the deleted `WEBSITE-BRCTOOLS-HANDOFF-apr27.md`. If it merges after your PR it
  will conflict on `DATA_MANIFEST.json` — flag it, don't let it resurrect the apr27 doc.
- Open PR #204 (topology docs) — unrelated surface, but check before renaming/deleting docs.
- The ingest stall recorded in PR #202 (`ssh-rsa` / `PubkeyAcceptedAlgorithms` failure
  since 2026-08-13 19:21Z) is the **SSH** path, not the HTTP upload contract. Out of
  scope — don't chase it here.

## The PR (one branch off dev, five files)

### 1. `public/js/aviation.js` — the only code change (line 49 at `6b6d823`)

```js
// before
const rwy = String(Math.round(heading / 10)).padStart(2, '0');
// after
const rwy = String(Math.floor(heading / 10)).padStart(2, '0');
```

179 → `Rwy17`, 359 → `Rwy35`. This matches the producer's label derivation
(`brc_tools/nwp/aviation.py`: `f"Rwy {heading // 10:02d}"`). The series-key derivation at
lines ~40-42 (`String(heading).padStart(3, '0')`) is already correct — leave it.

Optional cosmetic (note in the PR, fix only if trivial): line ~81 renders the header as
"HRRR hrrr_subh" because `payload.model` is the literal `"hrrr_subh"`. Acceptable as-is.

### 2. `DATA_MANIFEST.json` — add the product + MAJOR bump

- `version` → **`"2.0.0"`**, `lastUpdated` → merge date.
- Add `dataTypes.forecasts.products.hrrr_kvel_crosswind` (key matches the filename token;
  note the payload's `product` *field* is `"aviation_crosswind"` — that's intentional).
  Mirror the `hrrr_surface_layers` entry style (same `products` block, ~line 510).
  Draft to adapt:

```jsonc
"hrrr_kvel_crosswind": {
  "description": "HRRR sub-hourly runway head/crosswind forecast for KVEL (Vernal Regional). Runways 17/35 per FAA redesignation (true headings 179/359).",
  "schedule": {
    "frequency": "55 * * * *",
    "description": "Automatic - hourly export of the latest HRRR subh run (cron pending install on CHPC)",
    "timezone": "UTC"
  },
  "filename": {
    "pattern": "forecast_hrrr_kvel_crosswind_YYYYMMDD_HHMMZ.json",
    "example": "forecast_hrrr_kvel_crosswind_20260813_1800Z.json"
  },
  "schema": {
    "type": "object",
    "required": ["model", "product", "airport", "runway_headings_deg", "init_time", "valid_times", "series"],
    "properties": {
      "model":   { "type": "string", "enum": ["hrrr_subh", "hrrr"] },
      "product": { "type": "string", "enum": ["aviation_crosswind"] },
      "airport": { "type": "string", "enum": ["KVEL"] },
      "name":        { "type": "string" },
      "lat":         { "type": "number" },
      "lon":         { "type": "number" },
      "elevation_m": { "type": "number" },
      "runway_headings_deg": {
        "type": "array",
        "description": "Degrees TRUE, top-level. Drives every column pair; series keys are derived from these values.",
        "items": { "type": "integer", "minimum": 0, "maximum": 360 },
        "minItems": 2, "maxItems": 2
      },
      "init_time":    { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$" },
      "generated_at": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$" },
      "valid_times": {
        "type": "array",
        "items": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$" }
      },
      "forecast_minutes": { "type": "array", "items": { "type": "integer", "minimum": 0 } },
      "variables": { "type": "object", "description": "Per-series label/units/precision metadata (unread by aviation.js today)" },
      "series": {
        "type": "object",
        "description": "Every array MUST be index-aligned with valid_times; short arrays render as em-dashes, not errors. Per-runway keys are 'headwind_kt_' / 'crosswind_kt_' + String(heading).padStart(3,'0') for each heading in runway_headings_deg — currently _179 and _359.",
        "required": ["wind_speed_kt", "wind_dir_deg", "headwind_kt_179", "crosswind_kt_179", "headwind_kt_359", "crosswind_kt_359"],
        "properties": {
          "wind_speed_kt": { "type": "array", "items": { "type": ["number", "null"] } },
          "wind_dir_deg":  { "type": "array", "items": { "type": ["number", "null"] } },
          "gust_kt":       { "type": "array", "items": { "type": ["number", "null"] } }
        },
        "patternProperties": {
          "^(headwind|crosswind)_kt_\\d{3}$": { "type": "array", "items": { "type": ["number", "null"] } }
        }
      }
    }
  }
}
```

- Update the counters in `dataTypes.forecasts.validation` (~lines 630-636):
  `filesPerProduct` gains `"hrrr_kvel_crosswind": 1`; `totalFilesPerRun` 63 → **64**.

Ground truth if in doubt: producer `brc-tools/brc_tools/nwp/aviation.py:124-139` (payload
assembly) and the contract page `brc-tools/docs/WEBSITE-INTEGRATION.md:64-96`. Don't
invent fields.

### 3. `docs/MANIFEST-CHANGELOG.md` — add the 2.0.0 entry

Follow the existing entry format. Substance: first declaration of
`dataTypes.forecasts.products.hrrr_kvel_crosswind` under the corrected KVEL 17/35
contract (true headings 179/359, series keys `*_kt_179`/`*_kt_359`); MAJOR per the
field-name rule in `docs/MANIFEST-GUIDE.md` — the previously *documented* (never
published) contract used `*_kt_160`/`*_kt_340`; coordinated with **brc-tools v0.1.1**
(PR #59), which released first. Note zero legacy files exist, so no data migration.

### 4. `WEBSITE-BRCTOOLS-HANDOFF-aug13.md` — fix §TARGET 2 + Open Question 3

At `6b6d823`: lines ~188-210 (the JSONC example + header-derivation sentence) and
line ~317 (Open Question 3). Do **not** delete the doc — it expires only when all four
of its acceptance items pass.

- Example payload: `[160, 340]` → `[179, 359]`; `*_kt_160`/`*_kt_340` →
  `*_kt_179`/`*_kt_359`; `"model": "hrrr"` → `"hrrr_subh"`; add `gust_kt` to the series
  example (the producer sends it; the page currently ignores it).
- The header-rule sentence: `round(heading/10)` → `floor(heading/10)`, examples
  `179 → Rwy17`, `359 → Rwy35`.
- Replace "Confirm KVEL's current runway headings against the live FAA chart before
  hardcoding" and Open Question 3 with: **resolved 2026-08-13** — FAA chart confirmed,
  shipped in brc-tools #59 / v0.1.1.
- "Manifest entry: none yet" → point at the new `hrrr_kvel_crosswind` entry.

### 5. `docs/IMPROVEMENTS.md` — retire the booby-trapped pointer

At `6b6d823` (grep afresh — this file may have been refreshed on dev since):
- The "Add `forecast_hrrr_kvel_crosswind_*` schema to DATA_MANIFEST" row (~line 51):
  mark ✅ done via this PR, and **delete the instruction** "extracted in
  `WEBSITE-BRCTOOLS-HANDOFF-apr27.md` §DATATYPE 2; copy-pin" — that doc is deleted and
  its schema (`crosswind_kt_rwy16`, `metadata.runway_headings_deg_true`) was **wrong**
  (renders an empty table). Copy-pinning it would reintroduce the bug.
- The "Fix three dark dataTypes" row (~line 18) still cites the apr27 handoff — repoint
  to the aug13 doc while you're there.

## Not in scope

- **No upload-route change.** KVEL rides the existing `forecasts` dataType, distinguished
  by filename prefix; `server/routes/dataUpload.js` is untouched.
- **No multi-airport work.** The page is KVEL-only by design (hardcoded prefix,
  `aviation.js:11`); the "Nearby Airports" cards stay static.
- **No `runway_designators` payload field** (decision above).
- The `coming-soon-overlay` in `views/aviation.html:34-37`: whether to lift it is a
  product call for JRL **after** real data renders on `.com` — not part of this PR.

## After the merge: rehearsal → promotion → cron (sequencing, cross-repo)

1. **Deploy the dev merge to the `.dev` box** (pull + pm2 restart per `docs/DEPLOYMENT.md`).
2. **One-off rehearsal upload from CHPC** (brc-tools side, compute/DTN node, env
   `brc-tools-2026`) — targets `.dev` **only**:
   ```bash
   python scripts/export_hrrr_kvel_crosswind.py --upload \
       --server-url https://basinwx.dev \
       --airport KVEL --product subh --max-fxx 6
   ```
   (`--server-url` bypasses the fan-out config, so nothing reaches `.com`.)
3. **Verify on `.dev`:** `/api/filelist/forecasts` lists
   `forecast_hrrr_kvel_crosswind_*`; the aviation page renders a table with
   **HW/XW Rwy17 and Rwy35** columns and plausible numbers; `/api/health` reports
   `manifestVersion: "2.0.0"`. This is also the first-ever end-to-end run of the HRRR
   `subh` path — if the 15-min cadence looks wrong, that's a known brc-tools caveat
   (NWPSource discards the subh time axis; `aviation.py` calls Herbie directly).
4. **Promote dev→ops** per `docs/DEPLOYMENT.md` §7a (strip `-dev`, tag, reopen next
   `-dev`), deploy `.com`, spot-check the page.
5. **JRL installs the cron on notchpeak1** (nobody else can):
   ```
   55 * * * * ~/gits/brc-tools/scripts/cron/run_hrrr_kvel_crosswind_push.sh
   ```
   Unpinned — the consumer is on ops after step 4. First log:
   `~/logs/hrrr_kvel_crosswind.log`.
6. **brc-tools follow-up PR** (tracked there, not here): refresh the stale BLOCKED
   header in `scripts/cron/run_hrrr_kvel_crosswind_push.sh`, move KVEL out of
   "Deliberately absent" in `docs/CHPC-REFERENCE.md`, mark the redesignation cycle
   complete in `docs/WEBSITE-INTEGRATION.md` (and fix its drifting
   `DATA_MANIFEST.json:487` line refs).

## Acceptance checklist (delete this file when all pass)

- [ ] `aviation.js` floor fix merged to `dev`
- [ ] `DATA_MANIFEST.json` at 2.0.0 with `hrrr_kvel_crosswind` entry + counters updated
- [ ] `docs/MANIFEST-CHANGELOG.md` 2.0.0 entry
- [ ] `WEBSITE-BRCTOOLS-HANDOFF-aug13.md` §TARGET 2 + Open Q3 corrected (doc kept)
- [ ] `docs/IMPROVEMENTS.md` apr27 copy-pin instruction removed
- [ ] `.dev` rehearsal renders Rwy17/35 with real data; `manifestVersion` 2.0.0 on health
- [ ] Promoted dev→ops; `.com` page verified
- [ ] Cron installed on notchpeak1; first hourly log clean
