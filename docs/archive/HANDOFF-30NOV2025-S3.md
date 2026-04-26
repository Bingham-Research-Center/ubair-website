# Session Handoff: 30 November 2025 - Session 3

## Completed This Session

| Task | Details |
|------|---------|
| AQ Station Investigation | Used synopticpy to verify which stations return ozone data |
| Package fix | Uninstalled conflicting `synoptic` (Python 2), reinstalled `synopticpy` |
| Station ID mapping | Discovered A-series vs UB-series dual-ID issue |
| Updated brc-tools | Commented out offline stations, created `ubair_aq_stids` |
| Merged to dev | ubair-website integration branch merged to dev |

---

## Git Status

| Repo | Branch | Last Commit | Merged |
|------|--------|-------------|--------|
| brc-tools | `integration-clyfar-v0.9.5` | `b89e697` - fix offline UBAIR stations | - |
| ubair-website | `integration-clyfar-v0.9.5` | `eebedfe` | `dev` |
| clyfar | `integration-clyfar-v0.9.5` | `866e1ea` | - |

---

## Key Findings: Uinta Basin Ozone Stations

### Working Stations (8 total)
```
QV4     Vernal                     (Utah DAQ)
A3822   Dinosaur National Monument (Network 136)
QRS     Roosevelt                  (Utah DAQ)
A1386   Whiterocks                 (Network 136 = UBWHR)
A1388   Myton                      (Network 136)
A1622   Ouray                      (Network 136 = UBORY)
A1633   Redwash                    (Network 136 = UBRDW)
UB7ST   Seven Sisters              (UBAIR Network 209)
```

### Offline Stations
```
UBHSP   Horsepool    INACTIVE since Sep 2025
UBCSP   Castle Peak  No data since Nov 5, 2025
UBRVT   Roosevelt    INACTIVE (use QRS instead)
```

---

## Critical Issue: A-Series vs UB-Series Station IDs

Same physical locations have different Synoptic station IDs:

| A-Series | UB-Series | Location   | Status |
|----------|-----------|------------|--------|
| A1386    | UBWHR     | Whiterocks | A returns ozone, UB doesn't |
| A1622    | UBORY     | Ouray      | A returns ozone, UB doesn't |
| A1633    | UBRDW     | Red Wash   | A returns ozone, UB doesn't |
| A1388    | UBMTN     | Myton      | A returns ozone, UB doesn't |

**Action Required:**
1. Contact Synoptic Weather to understand ID mapping
2. Coordinate with local technicians about station status
3. May need to "fuse" A-series (AQ) + UB-series (met) for display

---

## Priority Queue for Next Sessions

| Priority | Task | Command/Notes |
|----------|------|---------------|
| P1 | Deploy to Akamai | `ssh akamai && cd ~/ubair-website && git pull && pm2 restart all` |
| P2 | Pull to CHPC | `ssh chpc && cd ~/gits/clyfar && git pull` |
| P3 | Test website features | Init dropdown, JSON cards, meteograms |
| P4 | Contact Synoptic | Re: A-series vs UB-series mapping |
| P5 | Monitor stations | UBHSP/UBCSP may come back online |

---

## Files Modified

| File | Changes |
|------|---------|
| `brc-tools/brc_tools/utils/lookups.py` | +38/-11: Created `ubair_aq_stids`, commented out offline stations |
| `~/.claude/plans/twinkling-cooking-ladybug.md` | Updated with S3 findings and handoff |

---

## Conda Environment Note

The `clyfar-2025` environment had a package conflict:
- Old `synoptic` (2014.1.1, Python 2) was shadowing `synopticpy`
- Fixed: `pip uninstall synoptic && pip install --force-reinstall synopticpy`
- Correct import: `from synoptic.services import Metadata, Latest, TimeSeries`

---

*Session ended: 30 Nov 2025*
*All repos committed and pushed*
*Next session: Deploy, test features, coordinate with Synoptic/technicians*
