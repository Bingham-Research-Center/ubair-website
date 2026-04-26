# PR: BasinWx Forecast Schema + Analytics - Ready for Clyfar Integration

## Overview
Adds forecast data schema (v1.1.0), analytics middleware, and deployment documentation to support **Clyfar v0.9.5 4×daily automated forecasts from CHPC**.

## What's New

### Forecast Data Schema (DATA_MANIFEST.json v1.1.0)
- **3 data products** with complete JSON schemas:
  - Possibility heatmaps (31 files per run)
  - Exceedance probabilities (1 file per run)
  - Percentile scenarios (31 files per run)
- **4 ozone categories**: background, moderate, elevated, extreme
- **Schedule**: 4× daily at 03:30, 09:30, 15:30, 21:30 UTC
- **Validation**: File size limits, schema enforcement, category validation
- **Status**: [PLANNED/NOT YET OPERATIONAL] until CHPC deployment

### Analytics Middleware
- **`server/middleware/analytics.js`**: Anonymous visitor tracking
  - IP anonymization (SHA256 + daily salt)
  - Tracks: page views, response times, browser/OS stats
  - Auto log rotation at 10MB
  - No cookies, no persistent IDs
- **Endpoint**: `GET /api/analytics/stats` for daily summaries
- **Logs**: `logs/analytics/` (gitignored)

### Deployment Documentation
- **`CHPC-IMPLEMENTATION.md`**: Master deployment guide (862 lines)
- **`PYTHON-PACKAGING-DEPLOYMENT.md`**: Packaging education (439 lines)
- **`DEPLOYMENT-SPECS-TODO.md`**: Server specs verification checklist
- **`CONTRADICTIONS-REPORT.md`**: Tech report alignment review
- **`CROSS-REPO-SYNC.md`**: Multi-agent coordination protocol
- **`SESSION-SUMMARY-2025-11-23.md`**: Previous session accomplishments

### Schedule Updates
- **Clyfar forecasts**: Added to pipeline table (4× daily, automatic)
- **Outlooks**: Corrected to ad-hoc/manual (not twice daily)
- **Cron templates**: Fixed observations-only schedule

## Testing Status

### Schema Validation ✓
- JSON schema defined for all 3 products
- Category validation (4 categories enforced)
- File count validation (63 files per run)

### Analytics Tested ✓
- Middleware integrated in server.js
- Log directory auto-creation
- IP anonymization working
- No personal info leakage

## Deployment Plan (Akamai/Linode)

### Pre-Deployment Checklist
- [ ] Verify server specs (see `DEPLOYMENT-SPECS-TODO.md`)
  - [ ] Disk space for 63 files × 4 runs/day
  - [ ] Inbound rate limits
  - [ ] Node.js version compatibility
- [ ] Test with ONE forecast upload from CHPC
- [ ] Monitor analytics logs growth
- [ ] Set up log rotation if needed

### Deployment Steps
1. **Merge to dev branch** (this PR)
2. **Deploy to staging** and test with CHPC upload
3. **Monitor first 24hrs** of analytics
4. **Merge dev → ops** after validation
5. **Enable Clyfar cron** on CHPC

## Cross-Repo Coordination

This PR is part of **3-repo integration**:
- **ubair-website** (this repo): Forecast schema + analytics
- **clyfar**: Export module + Slurm script
- **brc-tools**: Cross-repo documentation

All PRs use branch: `integration-clyfar-v0.9.5`

## Known Issues

1. **Forecast endpoint not yet handling uploads**: Need to test with real data
2. **Analytics not yet monitored**: First deployment will establish baseline
3. **MSLP unit mismatch** in tech report (Pa vs hPa) - documented but not blocking

## Breaking Changes
- `DATA_MANIFEST.json` bumped to v1.1.0 (added forecasts data type)
- Outlooks schedule corrected (was "twice daily", now "ad-hoc")

## Migration Notes
- Existing data types (observations, metadata, etc.) unchanged
- New analytics logs will be created in `logs/analytics/`
- No database migrations needed

## Post-Merge Actions
1. Deploy to Akamai staging
2. Test upload from CHPC with real Clyfar forecast
3. Verify 63 files received and validated
4. Monitor analytics for 24hrs
5. Merge to ops if successful

## Questions for Reviewers
1. Approve analytics logging approach (anonymous IP hashing)?
2. Log retention policy (auto-rotate at 10MB OK)?
3. Any concerns with 63 files × 4 times daily?

---

**Related PRs**:
- clyfar: `integration-clyfar-v0.9.5`
- brc-tools: `integration-clyfar-v0.9.5`

**Documentation**: Comprehensive guides included
**Tests**: Analytics middleware tested locally

**Ready for staging deployment and CHPC integration testing.**
