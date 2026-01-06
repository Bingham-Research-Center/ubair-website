<!-- NOTE: This documentation is scheduled for migration to brc-sop Wiki/Filebase. See: https://github.com/Bingham-Research-Center/brc-sop/issues/1 -->

# GitHub Wiki Management via Command Line

## Overview
GitHub wikis are separate Git repositories that live alongside your main repo. The `gh` CLI doesn't have built-in wiki commands, so you manage them using standard Git operations.

## Initial Setup

### 1. Enable Wiki (if not already enabled)
```bash
gh repo edit --enable-wiki
```

### 2. Initialize Wiki (REQUIRED FIRST)
**You MUST create the first page via web UI:**
1. Visit: `https://github.com/YOUR-ORG/YOUR-REPO/wiki`
2. Click "Create the first page"
3. Add content to Home page
4. Save

This creates the `.wiki.git` repository.

### 3. Clone Wiki Repository
```bash
# Clone to separate directory
git clone https://github.com/YOUR-ORG/YOUR-REPO.wiki.git

# Or clone to specific folder
git clone https://github.com/YOUR-ORG/YOUR-REPO.wiki.git my-wiki
```

## Working with Wiki Pages

### File Naming Convention
- Wiki pages are markdown files
- Filename = Page title with hyphens
- `Home.md` = Home page (default)
- `Deployment-SOP.md` = "Deployment SOP" page
- `API-Documentation.md` = "API Documentation" page

### Create New Wiki Page
```bash
cd repo.wiki

# Create new page
cat > My-New-Page.md << 'EOF'
# My New Page

Content goes here...
EOF

# Commit and push
git add My-New-Page.md
git commit -m "Add My New Page documentation"
git push
```

### Edit Existing Page
```bash
cd repo.wiki

# Edit the file
vim Deployment-SOP.md

# Commit and push
git add Deployment-SOP.md
git commit -m "Update deployment instructions"
git push
```

### Update Multiple Pages
```bash
cd repo.wiki

# Edit multiple files
vim Page-1.md Page-2.md Page-3.md

# Commit all changes
git add .
git commit -m "Update multiple documentation pages"
git push
```

### Delete Wiki Page
```bash
cd repo.wiki

# Remove the file
git rm Old-Page.md
git commit -m "Remove outdated page"
git push
```

## Viewing Wiki Pages

### Open Wiki in Browser
```bash
# From main repo directory
gh browse --wiki

# Or direct URL
open https://github.com/YOUR-ORG/YOUR-REPO/wiki
```

### List All Wiki Pages
```bash
cd repo.wiki
ls -1 *.md
```

### View Page Content
```bash
cd repo.wiki
cat Page-Name.md
```

## Syncing Wiki Changes

### Pull Latest Changes
```bash
cd repo.wiki
git pull
```

### Check Status
```bash
cd repo.wiki
git status
git log --oneline
```

## Complete Workflow Example

```bash
# 1. Enable wiki for your repo
gh repo edit --enable-wiki

# 2. Initialize via web (manual step - visit URL in browser)
# https://github.com/Bingham-Research-Center/ubair-website/wiki

# 3. Clone wiki repository
cd ~/projects
git clone https://github.com/Bingham-Research-Center/ubair-website.wiki.git
cd ubair-website.wiki

# 4. Create new page
cat > Deployment-Guide.md << 'EOF'
# Deployment Guide

## Steps
1. Run tests
2. Create PR
3. Deploy to ops
EOF

# 5. Commit and push
git add Deployment-Guide.md
git commit -m "Add deployment guide"
git push

# 6. View in browser
gh browse --wiki  # (run from main repo directory)
```

## Tips & Best Practices

### 1. Keep Wiki Clone Separate
```bash
# Don't clone wiki inside main repo
# Instead, keep them as siblings:
~/projects/
  ├── ubair-website/          # Main repo
  └── ubair-website.wiki/     # Wiki repo
```

### 2. Use Descriptive Commit Messages
```bash
git commit -m "Add API authentication documentation"
git commit -m "Update deployment SOP with rollback procedure"
```

### 3. Link Between Pages
```markdown
See the [Deployment SOP](Deployment-SOP) for details.
See [[API Documentation]] for authentication.
```

### 4. Add Table of Contents
Create a sidebar:
```bash
cat > _Sidebar.md << 'EOF'
## Documentation

- [Home](Home)
- [Deployment SOP](Deployment-SOP)
- [API Guide](API-Guide)
- [Testing](Testing-Guide)
EOF

git add _Sidebar.md
git commit -m "Add sidebar navigation"
git push
```

### 5. Add Footer
```bash
cat > _Footer.md << 'EOF'
---
Last updated: 2025-11-17 | [Report Issue](https://github.com/YOUR-ORG/YOUR-REPO/issues)
EOF
```

## Limitations

### What `gh` CLI Can't Do
- ❌ Create/edit wiki pages directly
- ❌ List wiki pages
- ❌ Search wiki content

### What You Can Do
- ✅ Enable/disable wiki: `gh repo edit --enable-wiki`
- ✅ Open wiki in browser: `gh browse --wiki`
- ✅ Everything else via Git commands

## Alternative: Using `/docs` Folder

If wiki limitations are frustrating, consider using a `/docs` folder in your main repo:

**Advantages:**
- Single repository
- Better discoverability
- Easier to maintain
- Can use `gh` CLI tools
- Included in code reviews

**Disadvantages:**
- Not as "pretty" as wiki UI
- No automatic sidebar/navigation

## Quick Reference

| Task | Command |
|------|---------|
| Enable wiki | `gh repo edit --enable-wiki` |
| Clone wiki | `git clone https://github.com/ORG/REPO.wiki.git` |
| Create page | `echo "# Title" > Page-Name.md` |
| Edit page | `vim Page-Name.md` |
| Commit changes | `git add . && git commit -m "msg" && git push` |
| Pull updates | `git pull` |
| Delete page | `git rm Page.md && git commit -m "Remove page" && git push` |
| View in browser | `gh browse --wiki` (from main repo) |

## Troubleshooting

### Error: Repository not found
**Cause:** Wiki not initialized
**Fix:** Create first page via web UI

### Error: Permission denied
**Cause:** Need write access to wiki
**Fix:** Ask repo admin for permissions

### Wiki changes not showing
**Cause:** Cache or push failed
**Fix:** 
```bash
git push  # Ensure push succeeded
# Clear browser cache or hard refresh
```

---

**For ubair-website team:**
- Wiki URL: https://github.com/Bingham-Research-Center/ubair-website/wiki
- Wiki repo: https://github.com/Bingham-Research-Center/ubair-website.wiki.git
