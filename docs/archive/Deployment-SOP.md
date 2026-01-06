<!-- NOTE: This documentation is scheduled for migration to brc-sop Wiki/Filebase. See: https://github.com/Bingham-Research-Center/brc-sop/issues/1 -->

# Deployment & Version Management SOP

## Overview
This document describes our team process for managing code deployments to the operational BasinWx website using a three-branch workflow.

## Branch Strategy

### Branch Purposes
- **main**: Stable baseline, rarely updated
- **dev**: Active development branch where features are merged
- **ops**: Production branch running on basinwx.com

### Workflow
```
Feature branches → dev (testing) → ops (production)
```

## Deployment Process

### 1. Feature Development
- Create feature branch from `dev`
- Develop and test locally
- Open PR to merge into `dev`
- Team reviews and approves
- Merge to `dev`

### 2. Team Deployment Meeting
We meet as a team to decide when to promote `dev` changes to production (`ops`). During these meetings we:
- Review all commits since last deployment
- Verify testing is complete
- Check for breaking changes
- Confirm data pipeline compatibility
- Decide on version number

### 3. Production Deployment
Once the team approves deployment:
1. Create PR from `dev` to `ops`
2. Tag the release (e.g., `ops-2025-11-17`)
3. Merge to `ops`
4. SSH to production server
5. Pull latest `ops` branch
6. Restart PM2 server: `pm2 restart basinwx`
7. Verify site is functioning

## Example Merge Tree (2025-11-17 Deployment)

This deployment merged 6 commits from dev into ops after a 9-day development cycle:

```
                                    ops-2025-11-17 (production)
                                           |
                                    985ca5f (ops)
                                      /    \
                                     /   78d7c90 (dev) ← mobile sidebar fix
                                    /       |
                                   /     b77c255 ← branching docs
                                  /         |
                                 /       025f9dd ← camera parallel processing
                                /           |
                               /         7f946f1 ← forecast layout fix
                              /             |
                      7f7f954 ←────────  8867222 ← center logo
                   (ops-2025-11-08)       |
                         |             d869c0b ← hide scrollbar
                         |                |
                    v0.9.5 (eb4dd07) ← 620b5d1 ← dashboard grid fix
                         |                |
                         └────────────────┴──────────────────────┐
                                          |                       |
                                  6ec0778 (main)          17a0e15 (fork point)
                                          |
                                     (creation)
```

**What happened:**
- Team accumulated 6 mobile UI fixes in `dev` over 9 days
- Met to review changes and approve deployment
- Created production deployment PR (#82)
- Tagged as `ops-2025-11-17`
- Merged and restarted production server
- Site now running with all 6 improvements

## Version Numbering

### Tags
- **ops-YYYY-MM-DD**: Production deployment tags
- **v0.9.x**: Semantic version tags on significant milestones

### When to Deploy
- Major bug fixes
- Security updates
- Feature sets ready for users
- Before/after high-traffic periods
- Typically every 1-2 weeks

## Rollback Procedure
If deployment causes issues:
1. SSH to production server
2. `git checkout <previous-ops-tag>`
3. `pm2 restart basinwx`
4. Create hotfix PR if needed

## Production Server Details
- **Server**: CHPC (chpc.utah.edu)
- **Process Manager**: PM2
- **Site**: https://basinwx.com
- **Data Pipeline**: Automated via cron jobs
- **Logs**: `pm2 logs basinwx`

## Team Communication
- PRs require 1+ approvals
- Deployment meetings scheduled via team chat
- Production issues reported immediately
- Post-deployment monitoring for 24 hours

---

*Last updated: 2025-11-17*
*Team: 4-person collaborative development team*
