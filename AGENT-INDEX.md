# AI Agent Quick Reference - ubair-website

**Current Task:** Clyfar v0.9.5 integration - production ready
**Status:** Phase 1 pending (post-compact resume)
**Session Date:** 2025-11-23

---

## Quick Start

**Resume after compact:**
```
Read: COMPACT-RESUME-POINT.md (full context)
Read: SESSION-SUMMARY-2025-11-23.md (what's done)
Execute: Phase 1 of approved plan
```

**Key Documentation:**
1. `COMPACT-RESUME-POINT.md` - Resume point and context
2. `SESSION-SUMMARY-2025-11-23.md` - Session accomplishments
3. `CHPC-IMPLEMENTATION.md` - Deployment master guide
4. `PYTHON-PACKAGING-DEPLOYMENT.md` - Packaging education
5. `POST-COMPACT-PERFORMANCE-TIPS.md` - Token efficiency

---

## Critical Context

### Data Architecture
- **3 data products:** Possibility (31 files) + Exceedance (1 file) + Percentiles (31 files)
- **4 categories:** background, moderate, elevated, extreme (NOT 5!)
- **Schedule:** 4× daily (00:30, 06:30, 12:30, 18:30 UTC)
- **Total files:** 63 JSON files per forecast run

### Repository Coordination
1. **ubair-website** (this repo) - Node.js website, receives data
2. **brc-tools** - Python data tools, shared package
3. **clyfar** - Ozone prediction model
4. **preprint-clyfar-v0p9** - LaTeX tech report (4th repo!)

### What's Complete
- ✅ brc-tools packaging (editable install in clyfar)
- ✅ Environment setup (.env files, conda)
- ✅ Export module skeleton (needs rewrite)
- ✅ Comprehensive plan approved

### What's Next
- ⏳ Phase 1: Tech report review (contradictions)
- ⏳ Phase 2-7: See COMPACT-RESUME-POINT.md

---

## Common Tasks

**Update schema:**
```
File: DATA_MANIFEST.json
Status: v1.1.0 started but incomplete
Action: Complete forecast schema with 4 categories
```

**Test integration:**
```bash
cd /Users/johnlawson/PycharmProjects/clyfar
conda activate clyfar-2025
python test_integration.py
```

**Check package install:**
```bash
conda activate clyfar-2025
python -c "from brc_tools.download.push_data import send_json_to_server; print('OK')"
```

---

## Avoid Common Pitfalls

❌ Don't use 5 categories (old assumption)
❌ Don't aggregate across members (wrong approach)
❌ Don't assume twice daily (it's 4× now)
❌ Don't hardcode paths (deployment-ready code)
❌ Don't re-read files unnecessarily (token waste)

✅ Use 4 categories from fis/v0p9.py
✅ Export per-member data (63 files)
✅ Schedule at 4× daily
✅ Use environment variables and configs
✅ Reference docs, use Task agents

---

## File Locations

**Implementation guides:**
- Deployment: `CHPC-IMPLEMENTATION.md`
- Packaging: `PYTHON-PACKAGING-DEPLOYMENT.md`
- Integration: `../clyfar/INTEGRATION_GUIDE.md`

**Schema:**
- Data manifest: `DATA_MANIFEST.json` (v1.1.0 in progress)
- Tech report: `/Users/johnlawson/Documents/GitHub/preprint-clyfar-v0p9`

**Code:**
- Upload module: `../clyfar/export/to_basinwx.py` (needs rewrite)
- Test suite: `../clyfar/test_integration.py`
- Website API: `server/routes/dataUpload.js`

---

## Cross-Repo Coordination

**When changing Clyfar config:**
1. Check Python code (source of truth)
2. Check tech report (methodology)
3. Update markdown docs (deployment)
4. Create CONTRADICTIONS-REPORT.md if mismatches found

**Sync workflow:** See CROSS-REPO-SYNC.md (to be created Phase 2)

---

**Last Updated:** 2025-11-23 (pre-compact)
**Next Review:** After Phase 1 completion
