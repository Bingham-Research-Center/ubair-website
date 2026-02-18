# AI Agent Quick Reference - ubair-website

**Current Task:** Dec 1 launch prep - CHPC/Akamai sync verification
**Status:** Code deployed to ops, awaiting CHPC cron verification
**Last Session:** 2025-11-27
**Branch:** `integration-clyfar-v0.9.5`

---

## Quick Start

**Resume after compact:**
```
Read: SESSION-27NOV2025.md (latest session - MOST IMPORTANT)
Read: CRON-SETUP-27NOV2025.md (CHPC crontab setup)
Verify: CHPC cron running, data flowing to basinwx.com
```

**Key Documentation:**
1. `SESSION-27NOV2025.md` - Latest session summary (27 Nov)
2. `CRON-SETUP-27NOV2025.md` - CHPC crontab and paths
3. `CHPC-IMPLEMENTATION.md` - Deployment master guide
4. `SESSION-SUMMARY-2025-11-23.md` - Earlier session
5. `COMPACT-RESUME-POINT.md` - Original context

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

### What's Complete (27 Nov Session)
- ✅ Homepage launch message (Dec 1 announcement)
- ✅ Coming Soon overlays on all unfinished pages
- ✅ Server filelist.json path bug fixed
- ✅ UBAIR ozone stations added to brc-tools
- ✅ Clyfar script paths corrected
- ✅ Code merged to dev and ops branches
- ✅ CHPC crontab documented

### What's Next
- ⏳ Verify CHPC cron is running (check ~/logs/obs.log)
- ⏳ Verify data appearing on basinwx.com
- ⏳ Test Clyfar manual run on CHPC
- ⏳ Upload outlook markdown via API

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
