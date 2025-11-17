# UBAIR Website Git Branching Workflow

**Last Updated:** Nov 5, 2025  
**Team:** BRC Web Development (John, Michael, Luke, Elspeth, Research Assistants)

---

## 🌳 Branch Structure

We use a **three-tier strategy** for stability and collaboration:

```
main (v1.0+)           ← Canonical source of truth (protected)
  ↓
ops (production)       ← What's on basinwx.com (protected)
  ↓
dev (testing)          ← Integration & testing (semi-protected)
  ↓
feature/* (your work)  ← Individual features (unprotected)
```

---

## 📋 Quick Start for New Features

### 1. Start Your Work

```bash
# Get latest dev code
git checkout dev
git pull origin dev

# Create your feature branch
git checkout -b feature/yourname-what-you're-doing

# Examples:
# feature/luke-quiz-game
# feature/michael-camera-fix
# feature/john-api-optimization
```

### 2. Do Your Work

```bash
# Make changes, test locally
npm run dev  # Test on localhost:3000

# Commit often (every logical change)
git add <files>
git commit -m "Clear description of what changed"

# Push to your branch
git push origin feature/yourname-what-you're-doing
```

### 3. Create Pull Request

```bash
# When ready for review
gh pr create --base dev --head feature/yourname-what-you're-doing \
  --title "Brief description" \
  --body "What this PR does:
  - List changes
  - Why needed
  - How tested
  "

# Or use GitHub website: New Pull Request
```

### 4. After Merge

```bash
# Delete your feature branch (cleanup)
git branch -d feature/yourname-what-you're-doing
git push origin --delete feature/yourname-what-you're-doing

# Start next feature from fresh dev
git checkout dev
git pull origin dev
git checkout -b feature/yourname-next-thing
```

---

## 🔄 Branch Lifecycle

### Feature Branches (`feature/*`)
- **Created from:** `dev`
- **Merged to:** `dev`
- **Lifetime:** 1-7 days
- **Testing:** Local only
- **Deleted after:** Merge to dev

### Dev Branch (`dev`)
- **Updated from:** `feature/*` branches (via PR)
- **Merged to:** `ops` (weekly)
- **Lifetime:** Permanent
- **Testing:** dev.basinwx.com or team local testing
- **Never deleted**

### Ops Branch (`ops`)
- **Updated from:** `dev` (weekly deployments)
- **Deployed to:** basinwx.com (production)
- **Lifetime:** Permanent
- **Testing:** Production monitoring
- **Tagged:** With deployment dates

### Main Branch (`main`)
- **Updated from:** `ops` or `dev` (after validation)
- **Deployed to:** Nowhere (canonical reference)
- **Lifetime:** Permanent
- **Tagged:** Major versions (v1.0, v1.1, etc.)
- **Never deleted**

---

## 📅 Weekly Schedule

### Monday - Friday
- **Developers:** Work on `feature/*` branches
- **Team:** Review PRs to `dev`
- **Merges:** `feature/*` → `dev` as approved

### Saturday - Sunday
- **Code freeze:** No new features to `dev`
- **Testing:** Verify `dev` stability
- **Deploy:** `dev` → `ops` Sunday night
- **Monitor:** Monday morning check production

---

## 🚨 Hotfixes (Emergency Only)

If production is broken and needs immediate fix:

```bash
# 1. Branch from ops
git checkout ops
git pull origin ops
git checkout -b hotfix/ops-brief-description

# 2. Make MINIMAL fix
# Only fix the immediate problem, nothing else

# 3. Test thoroughly
npm run dev
# Verify fix works

# 4. PR to ops (mark URGENT)
gh pr create --base ops --head hotfix/ops-brief-description \
  --title "HOTFIX: Brief description"

# 5. After merge & deploy, backport to dev
git checkout dev
git merge hotfix/ops-brief-description
git push origin dev

# 6. Later: Improve fix and merge to main
```

**Hotfix criteria:**
- ✅ Site is down or broken
- ✅ Data loss occurring
- ✅ Security vulnerability
- ❌ Minor bug (wait for weekly deploy)
- ❌ New feature (use normal workflow)

---

## ❌ Common Mistakes to Avoid

### DON'T:
1. ❌ Commit directly to `main`, `ops`, or `dev`
2. ❌ Push to someone else's `feature/*` branch without asking
3. ❌ Merge your own PR without review
4. ❌ Force push to protected branches (`main`, `ops`, `dev`)
5. ❌ Work on `main` or `ops` directly
6. ❌ Create `feature/*` from `main` (use `dev` instead)
7. ❌ Let feature branches live more than 1 week

### DO:
1. ✅ Always branch from `dev`
2. ✅ Commit often with clear messages
3. ✅ Test locally before PR
4. ✅ Request review on PRs
5. ✅ Delete feature branches after merge
6. ✅ Pull `dev` before creating new feature branch
7. ✅ Ask for help when stuck!

---

## 🔍 Checking Branch Status

### Where am I?
```bash
git branch  # Shows current branch with *
```

### What's different?
```bash
git status  # Shows modified files
git diff    # Shows actual changes
```

### Am I up to date?
```bash
git fetch origin
git status  # Will show "behind" if you need to pull
```

### What branches exist?
```bash
git branch -a  # All branches (local + remote)
```

---

## 🆘 Help & Troubleshooting

### "I'm on the wrong branch!"
```bash
# If you haven't committed yet:
git stash  # Save your work
git checkout dev
git checkout -b feature/your-name-task
git stash pop  # Restore your work
```

### "I committed to the wrong branch!"
```bash
# If you committed to dev instead of feature branch:
git reset HEAD~1  # Undo last commit (keeps changes)
git stash  # Save changes
git checkout -b feature/your-name-task
git stash pop  # Restore changes
git add .
git commit -m "Your message"
```

### "My branch is behind dev!"
```bash
git checkout dev
git pull origin dev
git checkout feature/your-branch
git merge dev  # Bring dev changes into your branch
# Resolve any conflicts, then commit
```

### "I need to delete a branch!"
```bash
# Delete local branch
git branch -d feature/old-branch

# Delete remote branch
git push origin --delete feature/old-branch
```

---

## 📞 Getting Help

**Stuck?** Don't struggle alone!

1. **Slack/Teams:** Post in #web-dev channel
2. **Tag:** @johnrobertlawson or @MichaelJosephDavies in PR
3. **Office Hours:** Tuesday 2-4pm (John), Thursday 10-12pm (Michael)
4. **Emergency:** Text John (for production issues only)

---

## 📚 Additional Resources

- [Git Basics Tutorial](https://git-scm.com/book/en/v2/Getting-Started-Git-Basics)
- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)
- [Pull Request Best Practices](https://github.com/blog/1943-how-to-write-the-perfect-pull-request)
- Our Project README: `/README.md`
- API Documentation: `/docs/API-OPTIMIZATION.md`

---

**Remember:** When in doubt, ask! We're a team. 🚀
