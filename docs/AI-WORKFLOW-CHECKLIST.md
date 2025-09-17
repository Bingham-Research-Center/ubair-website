# AI Agent Team Workflow Checklist

## Daily Development Workflow

### ✅ Before Starting Development
- [ ] Pull latest changes: `git pull origin main`
- [ ] Check AI context files are up to date: `npm run validate-ai-files`
- [ ] If working on new features, verify AI understanding with context test

### ✅ During Development  
- [ ] Use existing AI context files for routine development
- [ ] Only update AI files when making significant architectural changes
- [ ] Keep AI file changes focused and minimal

### ✅ Before Committing Changes to AI Files
- [ ] Run validation: `npm run validate-ai-files`
- [ ] Ensure validation passes (0 errors)
- [ ] Review warnings and fix critical ones
- [ ] Test AI understanding: `npm run test-ai-context`
- [ ] Update "Recent Updates" section with brief change summary

### ✅ After Pushing AI File Changes
- [ ] Notify team in chat: "Updated AI context files - [brief description]"
- [ ] Share any new patterns or important changes discovered
- [ ] Update team on any failed AI tests and fixes applied

## Weekly Team Review (Fridays)

### ✅ Team Lead Tasks
- [ ] Review all AI file changes from the week
- [ ] Run comprehensive validation: `npm run validate-ai-files`
- [ ] Check cross-file consistency
- [ ] Update shared sections if needed
- [ ] Plan major context restructuring if necessary

### ✅ Team Discussion Items
- [ ] Any AI agents giving incorrect/outdated information?
- [ ] New AI tools being adopted by team members?
- [ ] Changes needed to validation or testing scripts?
- [ ] Updates to team workflow or best practices?

## Monthly Comprehensive Review

### ✅ AI Context Audit
- [ ] Run full validation on all AI files
- [ ] Execute AI context tests: `npm run test-ai-context`
- [ ] Review coverage report and identify gaps
- [ ] Update outdated technology references
- [ ] Archive deprecated information

### ✅ Team Coordination
- [ ] Synchronize AI context across all repositories
- [ ] Review and update this workflow checklist
- [ ] Evaluate new AI tools or workflow improvements
- [ ] Update best practices based on lessons learned

## Emergency Procedures

### 🚨 If AI Agent Provides Incorrect Information
- [ ] **IMMEDIATE**: Stop using AI for that specific task
- [ ] Identify which context file contains the error
- [ ] Fix the incorrect information
- [ ] Run validation: `npm run validate-ai-files`
- [ ] Test the fix with AI context test
- [ ] Notify team: "Fixed AI context error in [file] - [description]"
- [ ] Document the incident for future prevention

### 🚨 If AI Context Files Become Inconsistent
- [ ] **PAUSE**: Stop AI-assisted development temporarily
- [ ] Run audit: `npm run validate-ai-files`
- [ ] Identify conflicting information
- [ ] Schedule team meeting to resolve conflicts
- [ ] Fix all inconsistencies before resuming
- [ ] Update validation script if needed to catch similar issues

## Quality Gates

### ✅ Before Major Releases
- [ ] All AI files pass validation with 0 errors
- [ ] AI context test shows >80% good coverage
- [ ] Team has reviewed and approved all recent AI file changes
- [ ] Cross-repository AI contexts are synchronized

### ✅ Before Onboarding New Team Members
- [ ] AI context files are comprehensive and up-to-date
- [ ] Validation script is working correctly
- [ ] This workflow checklist is current
- [ ] Example AI test sessions are prepared

## Tool Commands Quick Reference

```bash
# Validate AI context files
npm run validate-ai-files

# Test AI agent understanding  
npm run test-ai-context

# Test API functionality
npm run test-api

# Start development server
npm run dev
```

## Success Metrics

Track these metrics monthly:
- ✅ **Zero incidents** of AI providing outdated information
- ✅ **Fast onboarding** - new team members productive with AI in <1 day
- ✅ **Consistent context** - all AI files pass validation
- ✅ **Good coverage** - AI context tests show >80% good coverage
- ✅ **Team satisfaction** - AI tools help rather than hinder development

## File Update Responsibilities

| File | Primary Owner | Update Frequency | Approval Required |
|------|---------------|------------------|-------------------|
| `CLAUDE.md` | Web Team Lead | As needed | Team review for major changes |
| `docs/python-side-CLAUDE.md` | Python Developer | As needed | Coordination with web team |
| `references/COPILOT-README.md` | Any team member | Ongoing | No approval needed |
| `docs/AI-AGENT-MANAGEMENT.md` | Team Lead | Monthly review | Team consensus |

## Version Control Best Practices

### Git Commit Messages for AI Files
```
feat: update CLAUDE.md with new API endpoints
fix: correct outdated tech stack info in AI context
docs: add mobile responsiveness details to CLAUDE.md
refactor: restructure AI context for better consistency
```

### Branch Strategy
- AI context updates can go directly to main for minor changes
- Use feature branches for major restructuring
- Always include AI file validation in PR checks

---

**Remember**: This workflow should evolve based on team experience. Update this checklist as you discover what works best for your specific AI tool usage patterns.