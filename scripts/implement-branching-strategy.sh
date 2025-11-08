#!/bin/bash
# UBAIR Website Branching Strategy Implementation
# Run this script to set up the three-tier branching model

set -e  # Exit on error

echo "🌳 UBAIR Website Branching Strategy Setup"
echo "=========================================="
echo ""

# Step 1: Tag current state
echo "📌 Step 1: Tagging current state as v1.0-freeze..."
git tag -a v1.0-freeze -m "Freeze point before branching strategy - Nov 5, 2025

Includes:
- PR #51: UDOT API optimization with hybrid schedule  
- Camera clustering
- Background refresh service
- All current features stable

This tag marks the point where we implemented the three-tier branching strategy:
- main: Canonical source of truth
- ops: Production deployment
- dev: Integration/testing
"

git push origin v1.0-freeze
echo "✅ Tagged as v1.0-freeze"
echo ""

# Step 2: Create ops branch
echo "🚀 Step 2: Creating 'ops' branch (production)..."
git checkout -b ops
git push origin ops
echo "✅ Created and pushed 'ops' branch"
echo ""

# Step 3: Create dev branch
echo "🔧 Step 3: Creating 'dev' branch (testing/integration)..."
git checkout -b dev  
git push origin dev
echo "✅ Created and pushed 'dev' branch"
echo ""

# Step 4: Return to main
echo "🏠 Step 4: Returning to 'main'..."
git checkout main
echo "✅ Back on main branch"
echo ""

# Step 5: Commit workflow documentation
echo "📝 Step 5: Committing workflow documentation..."
git add docs/BRANCHING-WORKFLOW.md
git commit -m "Add branching workflow documentation for team

Implements three-tier strategy:
- main: Canonical repository (protected)
- ops: Production deployment (protected)  
- dev: Integration/testing (semi-protected)
- feature/*: Individual work (unprotected)

Includes:
- Quick start guide for research assistants
- Weekly deployment schedule
- Hotfix procedures
- Common mistakes and troubleshooting
"
git push origin main
echo "✅ Documentation committed"
echo ""

echo "=========================================="
echo "🎉 Branching strategy implemented!"
echo ""
echo "✅ Created branches:"
echo "   - ops (production)"
echo "   - dev (testing)"
echo ""
echo "✅ Created tag:"
echo "   - v1.0-freeze"
echo ""
echo "✅ Documentation:"
echo "   - docs/BRANCHING-WORKFLOW.md"
echo ""
echo "⚠️  NEXT STEPS (Manual on GitHub):"
echo "   1. Go to: Settings → General → Default branch"
echo "   2. Change from 'main' to 'dev'"
echo "   3. Go to: Settings → Branches → Add protection rule"
echo "   4. Protect 'main' (require 2 reviews)"
echo "   5. Protect 'ops' (require 1 review)"
echo "   6. Protect 'dev' (require 1 review)"
echo ""
echo "📖 Team guide: docs/BRANCHING-WORKFLOW.md"
echo "=========================================="
