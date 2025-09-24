# AI Agent Management for Multi-Developer Teams

## Overview

This document outlines best practices for managing AI/LLM agents across our 4-person collaborative team using various AI tools including Claude Code, Gemini, Codex, GitHub Copilot, and others.

## Current AI Agent Files

### Core Files
- **`CLAUDE.md`** - Main context file for Claude Code agents
- **`docs/python-side-CLAUDE.md`** - Claude context for brc-tools Python repository
- **`references/COPILOT-README.md`** - GitHub Copilot agent scratchpad

### File Responsibilities
- **Web developers**: Maintain `CLAUDE.md` for frontend/backend context
- **Python developers**: Maintain `docs/python-side-CLAUDE.md` for data pipeline context
- **All team members**: Can update `references/COPILOT-README.md` for Copilot observations

## Best Practices

### 1. File Naming Convention
```
CLAUDE.md                    # Main Claude context (web repo root)
GEMINI.md                    # Gemini-specific context (if needed)
CODEX.md                     # Codex-specific context (if needed)
docs/python-side-CLAUDE.md   # Claude context for Python developers
references/COPILOT-README.md # GitHub Copilot scratchpad
docs/AI-AGENT-MANAGEMENT.md  # This file - team coordination
```

### 2. Content Structure Standards

All AI agent files should follow this structure:
```markdown
# [AI Tool] Context for [Repository/Component]

## Project Overview
[Brief description of scope]

## Key Technical Details
[Core architecture, APIs, data flows]

## Team Coordination Notes
[Cross-repository dependencies, change coordination]

## Recent Updates
[Track significant changes with dates]

## Quick Reference
[Essential commands, patterns, debugging info]
```

### 3. Change Management Protocol

#### Before Making Changes to AI Files:
1. **Run validation script**: `npm run validate-ai-files`
2. **Check with team**: Post in team chat if making structural changes
3. **Test changes**: Use the "practical unit test" process below

#### After Making Changes:
1. **Validate again**: Ensure files pass validation
2. **Update version tracking**: Add entry to Recent Updates section
3. **Notify team**: Brief summary of what changed and why

### 4. Cross-Agent Coordination

#### Shared Information (keep consistent across all AI files):
- Project overview and mission
- Core tech stack (Node.js, Express, Leaflet, etc.)
- API endpoints and data flow
- File naming conventions
- Known issues and technical debt

#### Agent-Specific Information:
- **Claude**: Detailed context, conversation memory, domain knowledge
- **Copilot**: Code patterns, refactoring notes, ongoing work tracking
- **Gemini/Codex**: Tool-specific optimizations if needed

## Validation & Testing

### Automated Validation Script

The validation script (`scripts/validate-ai-files.js`) checks:
- ✅ Required sections are present
- ✅ Content is up-to-date (no stale information)
- ✅ Cross-references are consistent
- ✅ No sensitive information exposed
- ✅ Markdown syntax is valid

### Practical Unit Tests

Before committing changes to AI files, run this "practical unit test":

1. **Test with AI agent**: 
   ```bash
   # Ask your AI: "Based on the context file, how would you implement X?"
   # Verify the response shows understanding of current architecture
   ```

2. **Cross-check information**:
   ```bash
   npm run validate-ai-files
   ```

3. **Team member verification**:
   ```bash
   # Have another developer review changes for accuracy
   # Especially important for cross-repository dependencies
   ```

## Team Workflow

### Daily Development
- Use existing AI files as-is for routine development
- Update files only when making significant architectural changes
- Run validation before any commit that touches AI files

### Weekly Review (Fridays)
- Team lead reviews all AI file changes from the week
- Update shared sections for consistency
- Plan any major context restructuring

### Major Updates (monthly)
- Comprehensive review of all AI agent contexts
- Archive outdated information
- Update Recent Updates sections
- Consider adding new agent-specific files if team adopts new tools

## Tool-Specific Guidelines

### Claude Code
- **Primary file**: `CLAUDE.md`
- **Update frequency**: As needed for new features/architecture changes
- **Validation**: Must pass schema validation and practical tests

### GitHub Copilot
- **Primary file**: `references/COPILOT-README.md`
- **Update frequency**: Ongoing (scratchpad style)
- **Validation**: Less formal, but should maintain structure

### Gemini/Codex
- **Files**: Create as needed (`GEMINI.md`, `CODEX.md`)
- **Content**: Can reference `CLAUDE.md` for shared information
- **Validation**: Same standards as Claude files

## Emergency Procedures

### If AI Agent Gives Incorrect Information:
1. **Immediate**: Check relevant context file for accuracy
2. **Fix**: Update incorrect information and validate
3. **Notify**: Alert team to the specific issue
4. **Test**: Run practical unit test to verify fix

### If Context Files Become Inconsistent:
1. **Stop**: Pause AI-assisted development
2. **Audit**: Run validation script and manual review
3. **Coordinate**: Team meeting to resolve conflicts
4. **Update**: Fix all inconsistencies before resuming

## Success Metrics

### Validation Targets:
- ✅ All AI files pass validation before commits
- ✅ Zero incidents of AI agents providing outdated information
- ✅ Team coordination time reduced (fewer "what does this do?" questions)
- ✅ New team members onboard faster with AI assistance

### Review Schedule:
- **Weekly**: Quick consistency check (15 minutes)
- **Monthly**: Comprehensive audit and update (1 hour)
- **Quarterly**: Strategy review and tool evaluation

## Getting Started

### For New Team Members:
1. Read this document
2. Review all existing AI agent files
3. Run `npm run validate-ai-files` to understand validation
4. Make a small test change and practice the workflow

### For Existing Team Members:
1. Install validation script: `npm install` (includes validation dependencies)
2. Start using validation in your workflow: `npm run validate-ai-files`
3. Update your AI files to match the new structure
4. Begin following the change management protocol

---

*This document itself should be treated as a living document. Update as the team learns what works best for AI agent coordination.*