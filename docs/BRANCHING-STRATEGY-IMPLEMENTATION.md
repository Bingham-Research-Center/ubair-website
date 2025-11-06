# Branching Strategy Implementation Guide

**Created:** Nov 5, 2025  
**For:** UBAIR Website (BasinWx) - BRC Web Development Team  
**Status:** Ready for implementation

---

## 📊 Executive Summary

This document provides the complete implementation plan for the three-tier branching strategy, including rationale, setup instructions, and GitHub configuration details.

**Companion documents:**
- `BRANCHING-WORKFLOW.md` - Day-to-day team workflow guide
- This file - Strategic overview and implementation

---

## 🎯 Strategy Overview

### The Three-Tier Model

```
┌─────────────────────────────────────────┐
│  main (v1.0+)                           │  ← Canonical gold standard
│  Protected: 2 reviews required          │     (John + Michael approve)
│  Purpose: Clean history, documentation  │
└──────────────┬──────────────────────────┘
               │ Weekly clean merges after validation
               ↓
┌─────────────────────────────────────────┐
│  ops (production)                       │  ← basinwx.com deployment
│  Protected: 1 review required           │     Tagged with deploy dates
│  Purpose: Matches live site exactly     │
└──────────────┬──────────────────────────┘
               │ Weekly deployments (Sunday nights)
               ↓
┌─────────────────────────────────────────┐
│  dev (integration/testing)              │  ← Team collaboration hub
│  Protected: 1 review required           │     All features merge here first
│  Purpose: Pre-production testing        │
└──────────────┬──────────────────────────┘
               │ PRs from feature branches (continuous)
               ↓
┌─────────────────────────────────────────┐
│  feature/* (individual work)            │  ← Developer workspace
│  Unprotected: Experiment freely         │     Short-lived (1-7 days)
│  Purpose: Isolated development          │     Deleted after merge
└─────────────────────────────────────────┘
```

---

## ✅ Why This Strategy?

### For Your Team's Context

**Team composition:**
- 2 experienced leads (John, Michael)
- 2-4 research assistants (varying Git experience)
- Collaborative environment (multiple simultaneous features)

**Current challenges:**
- Mixed experience levels
- Live production site (basinwx.com) must stay stable
- Need to develop features without breaking production
- Want clean history for reference/documentation

**This strategy solves:**
- ✅ Beginners can't accidentally break production
- ✅ Features can be developed in parallel
- ✅ Easy rollback if something goes wrong
- ✅ Clear process for everyone to follow
- ✅ Separation of "testing" vs "production"

---

## 📅 Weekly Workflow

### Monday - Friday: Active Development

**Research Assistants:**
```bash
# Start new work
git checkout dev
git pull origin dev
git checkout -b feature/yourname-task

# Work and commit
git add .
git commit -m "Descriptive message"
git push origin feature/yourname-task

# When ready
gh pr create --base dev --head feature/yourname-task
```

**Team Leads:**
- Review PRs as they come in
- Merge approved work to `dev`
- Help with merge conflicts
- Monitor `dev` branch health

### Saturday: Code Freeze

- No new features merged to `dev`
- Existing PRs can be reviewed
- Team verifies `dev` is stable

### Sunday: Deploy to Production

**Morning:**
- Test `dev` branch thoroughly
- Run all automated tests
- Check dev deployment (if available)

**Evening (recommended: 8-10 PM):**
```bash
# Create deployment PR
gh pr create --base ops --head dev \
  --title "Weekly deployment: 2025-11-10" \
  --body "Deploying tested features from this week..."

# After approval and merge
git checkout ops
git pull origin ops

# Tag the deployment
git tag -a ops-2025-11-10 -m "Production deployment Nov 10, 2025"
git push origin ops-2025-11-10

# Deploy to server
ssh production-server
cd /var/www/basinwx
git pull origin ops
npm install --production
pm2 restart basinwx
```

**Monday Morning:**
- Verify production is stable
- Monitor logs for errors
- Ready for new week of development

---

## 🚀 Implementation Instructions

### Step 1: Run Automated Setup

```bash
# The implementation script handles:
# - Tagging current state (v1.0-freeze)
# - Creating ops branch
# - Creating dev branch
# - Committing documentation
# - Returning to main

bash /tmp/implement-branching-strategy.sh
```

**Script contents:**
```bash
#!/bin/bash
set -e

# Tag current state
git tag -a v1.0-freeze -m "Freeze point before branching strategy - Nov 5, 2025

Includes:
- PR #51: UDOT API optimization with hybrid schedule  
- Camera clustering
- Background refresh service
- All current features stable
"
git push origin v1.0-freeze

# Create ops from main (production baseline)
git checkout -b ops
git push origin ops

# Create dev from ops (testing baseline)
git checkout -b dev
git push origin dev

# Return to main
git checkout main

# Commit documentation
git add docs/BRANCHING-WORKFLOW.md docs/BRANCHING-STRATEGY-IMPLEMENTATION.md
git commit -m "Add branching strategy documentation for team"
git push origin main
```

### Step 2: Configure GitHub Branch Protection

**Navigate to:** `https://github.com/Bingham-Research-Center/ubair-website/settings/branches`

#### Protect `main` Branch

**Add rule → Branch name pattern:** `main`

**Settings:**
```
☑ Require a pull request before merging
  ☑ Require approvals: 2
  ☑ Dismiss stale pull request approvals when new commits are pushed
  ☐ Require review from Code Owners (optional - if you create CODEOWNERS file)
  ☑ Restrict who can dismiss pull request reviews (optional)
  
☑ Require status checks to pass before merging
  ☑ Require branches to be up to date before merging
  ☐ Status checks (add if you have CI/CD setup):
      - npm test
      - build
  
☑ Require conversation resolution before merging

☑ Require signed commits (optional - extra security)

☐ Require linear history (optional - cleaner git log)

☑ Require deployments to succeed before merging (optional)

☑ Lock branch (optional - extreme protection)

☑ Do not allow bypassing the above settings
  ☑ Include administrators

☐ Allow force pushes: NEVER
☐ Allow deletions: NEVER
```

#### Protect `ops` Branch

**Add rule → Branch name pattern:** `ops`

**Settings:**
```
☑ Require a pull request before merging
  ☑ Require approvals: 1
  ☑ Dismiss stale pull request approvals
  
☑ Require status checks to pass before merging
  ☑ Require branches to be up to date
  
☑ Require conversation resolution before merging

☑ Do not allow bypassing the above settings
  ☑ Include administrators

☐ Allow force pushes: NEVER
☐ Allow deletions: NEVER
```

#### Protect `dev` Branch

**Add rule → Branch name pattern:** `dev`

**Settings:**
```
☑ Require a pull request before merging
  ☑ Require approvals: 1
  
☑ Require status checks to pass (if available)

☑ Require conversation resolution before merging

☐ Do not allow bypassing the above settings
  ☐ Include administrators (give team leads escape hatch)

☐ Allow force pushes: YES (for cleanup - but use carefully!)
  ☑ Specify who can force push: johnrobertlawson, MichaelJosephDavies

☐ Allow deletions: NEVER
```

### Step 3: Change Default Branch

**Navigate to:** `Settings → General → Default branch`

**Change from:** `main`  
**Change to:** `dev`

**Reason:** Makes all new PRs target `dev` by default (correct workflow)

### Step 4: Create CODEOWNERS File (Optional)

**Create:** `.github/CODEOWNERS`

```
# Code owners are automatically requested for review
# when someone opens a pull request

# Global owners (apply to everything)
* @johnrobertlawson @MichaelJosephDavies

# Python/data pipeline
*.py @johnrobertlawson
scripts/ @johnrobertlawson
chpc-deployment/ @johnrobertlawson

# Frontend
public/ @MichaelJosephDavies
views/ @MichaelJosephDavies
*.html @MichaelJosephDavies
*.css @MichaelJosephDavies

# Server/API
server/ @johnrobertlawson @MichaelJosephDavies

# Documentation
*.md @johnrobertlawson
docs/ @johnrobertlawson
```

---

## 📋 Branch Details

### `main` Branch

**Purpose:** Canonical source of truth with clean history

**Updates from:**
- `ops` (after 2-4 weeks of stable production)
- `dev` (occasionally, for major milestones)

**Update frequency:** Monthly or quarterly

**Merge requirements:**
- 2 approvals required
- All tests passing
- Full documentation
- Clean commit messages
- Squashed or rebased (no merge commits)

**Tagging convention:**
- `v1.0` - Initial stable release
- `v1.1` - Minor version (new features)
- `v1.1.1` - Patch version (bug fixes)
- `v2.0` - Major version (breaking changes)

**Never deployed to:** Nowhere (reference/archive only)

---

### `ops` Branch

**Purpose:** Exact mirror of production (basinwx.com)

**Updates from:** `dev` (weekly deployments)

**Update frequency:** Weekly (Sunday nights)

**Merge requirements:**
- 1 approval required
- All tests passing on `dev`
- Soak testing complete (48+ hours on dev)
- Deployment plan documented

**Tagging convention:**
- `ops-2025-11-10` - Deployment date
- `ops-v1.1.5` - Deployment + version
- `hotfix-2025-11-10` - Emergency fix

**Deployed to:** basinwx.com (production Akamai server)

**Deployment process:**
```bash
ssh production-server
cd /var/www/basinwx
git fetch origin
git checkout ops
git pull origin ops
npm install --production
pm2 restart basinwx
pm2 logs basinwx  # Monitor for errors
```

**Rollback process:**
```bash
# If deployment fails
git checkout <previous-tag>
npm install --production
pm2 restart basinwx

# Or
git revert <bad-commit>
git push origin ops
# Deploy again
```

---

### `dev` Branch

**Purpose:** Integration and pre-production testing

**Updates from:** `feature/*` branches (continuous)

**Update frequency:** Daily (as PRs are approved)

**Merge requirements:**
- 1 approval required
- Tests passing (if available)
- Conflicts resolved
- Code review complete

**Deployed to:** 
- `dev.basinwx.com` (if you set up dev server)
- OR team member localhost testing

**Testing period:** 48+ hours before deploying to `ops`

**Cleanup allowed:**
- Can force push to fix history (carefully!)
- Can squash commits before merging to ops
- Can revert failed experiments

---

### `feature/*` Branches

**Purpose:** Individual developer workspace

**Created from:** `dev` (always)

**Merged to:** `dev` (always)

**Lifetime:** 1-7 days (delete after merge)

**Naming convention:**
```
feature/yourname-description
  Examples:
  - feature/luke-quiz-game
  - feature/michael-camera-fix
  - feature/john-api-optimization

bugfix/yourname-description
  Examples:
  - bugfix/john-map-crash
  - bugfix/elspeth-css-mobile

hotfix/ops-description  (ONLY from ops for emergencies)
  Examples:
  - hotfix/ops-api-timeout
  - hotfix/ops-data-loss
```

**No protection:** Experiment freely!

**Best practices:**
- Commit often (every logical change)
- Push daily (backup your work)
- Keep focused (one feature per branch)
- Test locally before PR
- Delete after merge to dev

---

## 🚨 Hotfix Process

### When to Use Hotfixes

**Use hotfixes ONLY for:**
- ✅ Site is completely down
- ✅ Data loss or corruption occurring
- ✅ Security vulnerability actively exploited
- ✅ Critical API failure affecting users

**DO NOT use hotfixes for:**
- ❌ Minor bugs (wait for weekly deploy)
- ❌ New features (use normal workflow)
- ❌ Cosmetic issues (wait for weekly deploy)
- ❌ Performance improvements (test in dev first)

### Hotfix Workflow

```bash
# 1. Branch from ops (what's currently broken)
git checkout ops
git pull origin ops
git checkout -b hotfix/ops-brief-description

# 2. Make MINIMAL fix
# Fix ONLY the immediate problem
# Don't refactor, don't add features, don't "improve while you're here"

# 3. Test thoroughly
npm run dev
# Verify fix actually works

# 4. Create URGENT PR
gh pr create --base ops --head hotfix/ops-brief-description \
  --title "HOTFIX: Brief description of problem" \
  --label "urgent,hotfix" \
  --body "URGENT PRODUCTION HOTFIX

Problem: [describe what's broken]
Impact: [how many users affected]
Fix: [what you changed]
Testing: [how you verified it works]
Rollback: [how to undo if needed]
"

# 5. Get immediate approval and merge
# Skip normal review process if critical

# 6. Deploy immediately
ssh production-server
cd /var/www/basinwx
git pull origin ops
pm2 restart basinwx

# 7. Monitor closely for 30 minutes
pm2 logs basinwx

# 8. Backport to dev (within 24 hours)
git checkout dev
git pull origin dev
git merge hotfix/ops-brief-description
git push origin dev

# 9. Improve and merge to main (within 1 week)
# Create proper solution with:
# - Better error handling
# - Logging
# - Tests
# - Documentation
```

---

## 🔧 Advanced Topics

### Resolving Merge Conflicts

**If `dev` conflicts with your feature branch:**

```bash
git checkout dev
git pull origin dev
git checkout feature/yourname-task
git merge dev

# Git will show conflicts
# Edit files to resolve
# Look for:
# <<<<<<< HEAD
# Your changes
# =======
# Their changes
# >>>>>>> dev

# After resolving:
git add .
git commit -m "Resolve merge conflicts with dev"
git push origin feature/yourname-task
```

### Cherry-Picking Commits

**To copy a single commit between branches:**

```bash
# Find commit you want
git log --oneline

# Copy to another branch
git checkout target-branch
git cherry-pick <commit-hash>
git push origin target-branch
```

**Use case:** Backporting hotfix from ops to dev

### Squashing Commits

**Before merging feature to dev:**

```bash
# Interactive rebase to clean up history
git rebase -i dev

# In editor, change "pick" to "squash" for commits to combine
# Save and exit
# Edit combined commit message
# Force push (your branch only!)
git push origin feature/yourname-task --force
```

**Use case:** You made 20 "WIP" commits, want 1 clean commit

---

## 📚 Additional Documentation

### For Team Members

**Essential reading:**
1. `BRANCHING-WORKFLOW.md` - Day-to-day workflow (start here!)
2. This file - Strategic overview and setup
3. `README.md` - Project overview
4. `CRON_SCHEDULE_ANALYSIS.md` - API optimization details

**Optional reading:**
5. `API_FIX_SUMMARY.md` - UDOT API changes
6. `CAMERA_CLUSTERING_IMPLEMENTATION.md` - Technical details
7. `HOW_IT_WORKS.md` - System architecture

### For Team Leads

**Additional topics:**
- Setting up CI/CD (GitHub Actions)
- Automated testing before merge
- Code coverage requirements
- Deployment automation
- Monitoring and alerting
- Security scanning

---

## ⚠️ Migration Period (First Month)

### Week 1: Setup and Training
- ✅ Run implementation script
- ✅ Configure GitHub protections
- ✅ Team meeting: Explain workflow
- ✅ Share `BRANCHING-WORKFLOW.md`
- ⏸️ Don't delete any old branches yet

### Week 2-4: Practice
- ✅ All new work uses new workflow
- ✅ Weekly deploys: dev → ops
- ⚠️ Expect questions/mistakes (normal!)
- ✅ Document any issues
- ⏸️ Still don't delete old branches

### Month 2+: Normal Operation
- ✅ Weekly: dev → ops (Sundays)
- ✅ Monthly: ops → main (after validation)
- ✅ Clean up old branches
- ✅ Refine process based on team feedback

---

## 🎯 Success Metrics

**After 1 month, you should see:**
- ✅ Zero accidental commits to protected branches
- ✅ All features go through PR review
- ✅ Production deployments are stable
- ✅ Clear history in git log
- ✅ Team confident in workflow

**If you see problems:**
- ⚠️ Frequent merge conflicts → Feature branches too long
- ⚠️ Hotfixes every week → Need better testing in dev
- ⚠️ Confusion about workflow → Need more training/docs
- ⚠️ Slow PR reviews → Need more reviewers

---

## 🔄 Alternative: Simpler Two-Tier

**If three tiers is too complex:**

```
main (production)     ← What's on basinwx.com
  ↓
feature/* (work)      ← Development branches
```

**Pros:**
- Simpler (only 2 levels)
- Fewer branches to manage
- Faster workflow

**Cons:**
- No separation between testing and production
- Riskier deployments
- Harder to maintain clean main history

**Recommendation:** Try three-tier for 1 month. Can simplify if needed.

---

## 📞 Questions?

Contact:
- **Git workflow:** @johnrobertlawson
- **GitHub setup:** @MichaelJosephDavies
- **Team training:** Both (schedule meeting)

---

**Remember: This is a living document. Adjust based on what works for your team!** 🚀
