# PR SPEEDRUN REVIEW PLAN (20-30 minutes)

## SETUP (2 min)
```bash
# Create safety branch from current main
git checkout main
git pull origin main
git checkout -b pre-review-backup
git push origin pre-review-backup

# Check what's currently deployed
git log --oneline -5
```

## PR #33 - Homepage Responsive (5 min) ✅ SAFE - CSS only
```bash
# Terminal
gh pr checkout 33
gh pr diff 33 | head -100  # Quick scan

# WebStorm - Open side-by-side:
# - public/styles/dashboard.css (changes)
# - views/dashboard.html (context)

# Browser Test
npm run dev
# Test URLs:
# - http://localhost:3000/dashboard (desktop)
# - DevTools: iPhone SE (375px), iPad (768px), Desktop (1920px)
# - Verify: No overflow, readable text, proper grid layout

# Decision criteria:
✅ Merge if: No layout breaks, responsive on 3+ screen sizes
❌ Hold if: Text overlaps, buttons off-screen, horizontal scroll

# Merge command:
gh pr review 33 --approve --body "Tested on mobile/tablet/desktop - LGTM"
gh pr merge 33 --squash --delete-branch
```

## PR #32 - Easter Eggs Refactor (5 min) ⚠️ MODERATE - JS changes
```bash
# Terminal
gh pr checkout 32
gh pr diff 32 --name-only  # See all files changed

# WebStorm - Review files:
# - public/scripts/easter-eggs.js (new architecture?)
# - Check: Are old easter eggs still working?

# Browser Test
npm run dev
# Test sequence:
# 1. Try old easter eggs (if documented)
# 2. Test Konami code: ↑↑↓↓←→←→BA
# 3. Verify kiosk mode still accessible
# 4. Check console for errors (F12)

# Decision criteria:
✅ Merge if: Easter eggs work, no console errors, backward compatible
❌ Hold if: Breaks existing functionality, console errors

# Merge command:
gh pr review 32 --approve --body "Konami code works, no regressions"
gh pr merge 32 --squash --delete-branch
```

## PR #31 - Snow Detection (8 min) ⚠️ MODERATE - Algorithm + tests
```bash
# Terminal
gh pr checkout 31
gh pr diff 31 | grep -E "test|spec" | head -20  # Check tests exist

# WebStorm - Code review:
# - Look for test files (*.test.js, *.spec.js)
# - Check: Are tests passing?

# Run tests
npm test 2>&1 | tee test-output.txt
# Or if specific test command:
npm run test:snow  # (if exists)

# Browser Test (if has UI)
npm run dev
# Navigate to road weather cams
# Check: Snow detection labels/badges appear correctly

# Decision criteria:
✅ Merge if: All tests pass (100%), no breaking changes to cam UI
⚠️ Review AI if: Tests fail, unclear algorithm logic
❌ Hold if: Test failures, breaks existing cam features

# Get AI review before merge:
gh pr diff 31 > pr31-review.diff
# Then ask Claude: "Review this snow detection algorithm for correctness"

# Merge command (if approved):
gh pr review 31 --approve --body "All tests passing, algorithm validated"
gh pr merge 31 --squash --delete-branch
```

## PR #22 - API Cache Optimization (10 min) 🔴 HIGH RISK - Infrastructure
```bash
# Terminal
gh pr checkout 22
gh pr diff 22 --name-only

# WebStorm - Critical review:
# - server/routes/* (API changes?)
# - Look for: Caching logic, new dependencies
# - Check: package.json for new packages

# Check for new env vars needed
grep -r "process.env" --include="*.js" | grep -v node_modules | grep -v ".env"

# Test locally
npm run dev

# Browser Test - COMPREHENSIVE:
# 1. Road weather cams - check loading speed
# 2. Dashboard - verify data freshness
# 3. Check network tab (F12) - verify cache headers
# 4. Refresh multiple times - confirm cache working
# 5. Wait 10+ min - confirm cache expiry works

# Decision criteria:
✅ Merge if: Faster load times, data still fresh, no stale data issues
⚠️ Get AI review: If unsure about cache logic
❌ Hold if: Stale data, errors, or requires production env vars

# AI review command:
gh pr diff 22 > pr22-review.diff
# Ask Claude: "Review caching implementation for race conditions and stale data risks"

# Merge command (if fully validated):
gh pr review 22 --approve --body "Cache working correctly, 85% reduction confirmed"
gh pr merge 22 --squash --delete-branch
```

## SAFETY CHECKS BEFORE EACH MERGE
```bash
# Before ANY merge, run:
git checkout main
git pull origin main
npm install  # In case package.json changed
npm run dev  # Verify main still works

# After each merge:
git pull origin main
npm run dev  # Verify merged changes work
# Quick smoke test in browser
```

## ROLLBACK PLAN (if disaster)
```bash
# If merged PR breaks production:
git checkout main
git pull origin main
git log --oneline -5  # Find bad commit hash

# Option 1: Revert specific merge
git revert -m 1 <merge-commit-hash>
git push origin main

# Option 2: Nuclear option - restore backup
git reset --hard pre-review-backup
git push origin main --force-with-lease

# Option 3: Hotfix
git checkout -b hotfix/revert-pr-XX
# Make fix
git push origin hotfix/revert-pr-XX
gh pr create --fill
```

## FINAL CHECKLIST
After all merges:
```bash
# 1. Verify main branch
git checkout main
git pull origin main
npm install
npm run dev

# 2. Test critical paths:
# - Homepage loads
# - Dashboard shows data
# - Road weather cams work
# - No console errors

# 3. Check deployed site (if auto-deploys)
curl -I https://basinwx.com
# Visit actual site

# 4. Notify team
# Post in Slack/Discord: "Merged PRs #33, #32, #31, #22 - please pull latest main"
```

## TIME ESTIMATES
- PR #33 (CSS): 5 min ✅ Low risk
- PR #32 (Easter eggs): 5 min ⚠️ Medium risk  
- PR #31 (Snow detection): 8 min ⚠️ Medium risk
- PR #22 (API cache): 10 min 🔴 High risk
- **Total: 28 minutes + 5 min buffer = 33 min**

## SUGGESTED ORDER (by risk)
1. **PR #33** - Safest, CSS only
2. **PR #32** - Medium, feature toggle
3. **PR #31** - Medium, has tests
4. **PR #22** - Last, infrastructure change (save for after meeting if tight on time)

## HOW TO USE CLAUDE FOR PR REVIEWS

### Quick AI Security Scan
```bash
gh pr diff 33 | pbcopy  # Copy to clipboard
# Ask: "Security review this PR for vulnerabilities"
```

### AI Code Quality Review
```bash
# Ask: "Review PR #32 as a senior JavaScript engineer - check for bugs and best practices"
```

### AI Performance Analysis
```bash
# Ask: "Analyze PR #22 caching implementation for race conditions and edge cases"
```

### AI Test Coverage Check
```bash
# Ask: "Review PR #31 test coverage - what's missing?"
```
