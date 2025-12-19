# Resume Point After Compact - 2025-11-23

**Status:** Ready to execute approved comprehensive plan

---

## Current Phase
**Phase 1 of 7:** Tech report review and contradiction flagging

---

## Last Completed Actions
1. ✅ Installed brc-tools in clyfar-2025 conda env (editable mode)
2. ✅ Created export module skeleton (needs rewrite for 3 products)
3. ✅ Comprehensive plan approved (7 phases, 6-8 hours)
4. ✅ Todos updated for new plan
5. ✅ All setup and testing complete

---

## Next Immediate Action
**Start Phase 1:** Review tech report files in `/Users/johnlawson/Documents/GitHub/preprint-clyfar-v0p9`

**Command to resume:**
```
"Start Phase 1: Review tech report at /Users/johnlawson/Documents/GitHub/preprint-clyfar-v0p9
and create CONTRADICTIONS-REPORT.md. Use Task agent for token efficiency."
```

---

## Critical Decisions Made

### Data Architecture
- **3 data products per run:**
  1. Possibility heatmaps: 31 files (4×17 per member)
  2. Exceedance probabilities: 1 file (ensemble consensus)
  3. Percentile scenarios: 31 files (10th/50th/90th ppb)
- **Total:** 63 JSON files per forecast run
- **Upload:** Separate POST requests (not ZIP)

### Schedule
- **Frequency:** 4× daily (not twice)
- **Times:** 00:30, 06:30, 12:30, 18:30 UTC
- **Rationale:** GEFS runs at 00/06/12/18Z + 3.5hr latency buffer

### Categories
- **4 categories (not 5):** background, moderate, elevated, extreme
- **Source:** Confirmed in `clyfar/fis/v0p9.py:78-83`
- **Type:** Dubois-Prade possibility values (0-1)

### Repository Coordination
- **4 repos total:**
  1. ubair-website (Node.js website)
  2. brc-tools (Python data tools)
  3. clyfar (Ozone prediction model)
  4. preprint-clyfar-v0p9 (LaTeX tech report)
- **Sync strategy:** CROSS-REPO-SYNC.md in all repos

---

## Files Created This Session

### ubair-website/
```
PYTHON-PACKAGING-DEPLOYMENT.md    ✅ Complete
CHPC-IMPLEMENTATION.md             ✅ Complete
SESSION-SUMMARY-2025-11-23.md      ✅ Complete
DATA_MANIFEST.json                 ⚠️  v1.1.0 started (needs completion)
COMPACT-RESUME-POINT.md            ✅ This file
```

### clyfar/
```
export/__init__.py                 ✅ Complete
export/to_basinwx.py               ⚠️  Needs complete rewrite (wrong schema)
INTEGRATION_GUIDE.md               ✅ Complete (needs update for 3 products)
test_integration.py                ✅ Complete (needs update for 4 categories)
GIT_COMMIT_GUIDE.md                ✅ Complete
.env.example                       ✅ Complete
.env                               ✅ Complete (local only)
.gitignore                         ✅ Updated
README.md                          ✅ Updated with multi-agent note
```

### brc-tools/
```
README.md                          ✅ Updated with deployment section
```

---

## Approved Plan Summary

**Phase 1:** Tech report alignment (45 min)
- Review `/Users/johnlawson/Documents/GitHub/preprint-clyfar-v0p9`
- Extract membership functions, thresholds, categories
- Flag contradictions vs Python code
- Create CONTRADICTIONS-REPORT.md

**Phase 2:** Cross-repo sync docs (30 min)
- Create CROSS-REPO-SYNC.md in all 4 repos
- Workflow for preventing drift
- AI agent instructions

**Phase 3:** Data schema implementation (2-3 hours)
- Rewrite `export/to_basinwx.py` for 3 products
- Update DATA_MANIFEST.json with correct schema
- Test export with real data

**Phase 4:** Schedule updates (30 min)
- Change all "twice daily" to "4× daily"
- Update cron templates
- Add GEFS latency notes

**Phase 5:** Website analytics (1 hour)
- Simple logging middleware
- Track visitors, dwell time, system load
- Anonymous where possible

**Phase 6:** Git branching (15 min)
- Create `integration-clyfar-v0.9.5` branch
- Prepare for PR to dev → ops

**Phase 7:** CHPC optimization (30 min)
- Create Slurm submission script
- Check parallel download
- Avoid login node strain

---

## Token Budget Strategy (Post-Compact)

**Use Task agents for:**
- Tech report review (Phase 1)
- Large file searches
- Cross-repo exploration
- Validation checks

**Use direct tools for:**
- File edits (known changes)
- Small file reads
- Git operations
- Testing

**Reference instead of re-reading:**
- SESSION-SUMMARY-2025-11-23.md
- This file (COMPACT-RESUME-POINT.md)
- Approved plan in ExitPlanMode above

---

## Important Gotchas

1. **Export module is WRONG** - Current version uses 5 categories + aggregation. Needs complete rewrite.
2. **DATA_MANIFEST.json incomplete** - Started v1.1.0 but interrupted. Needs completion.
3. **Tech report may have contradictions** - Manual review required after flagging.
4. **GEFS latency varies** - 3.5hr buffer is conservative estimate, monitor and adjust.
5. **63 files per run** - Test upload workflow thoroughly before production.

---

## Quick Commands

**Resume work:**
```bash
cd /Users/johnlawson/WebStormProjects/ubair-website
# Review this file and SESSION-SUMMARY-2025-11-23.md
# Then start Phase 1
```

**Check package setup:**
```bash
conda activate clyfar-2025
python -c "from brc_tools.download.push_data import send_json_to_server; print('OK')"
```

**Run test:**
```bash
cd /Users/johnlawson/PycharmProjects/clyfar
python test_integration.py  # Will fail until export rewritten
```

---

## Performance After Compact

**For AI Agent:**
- Read this file first (full context)
- Use Task agents for research
- Batch file edits
- Reference line numbers, don't re-read
- Check token usage periodically

**For Human:**
- Give specific phase: "Continue Phase 1"
- Point to docs, not raw files
- Approve incrementally if concerned
- Monitor token usage

---

**Ready to resume with Phase 1 after compact!**
