# Performance Tips for Post-Compact Session

## For AI Agent (Claude Code)

### Token Conservation Strategies

1. **Use Task Agents Aggressively**
   - Tech report review → Task with Plan subagent
   - File searches across repos → Task with Explore subagent
   - Large document analysis → Task agent
   - **Why:** Agents run in separate context, don't bloat main session

2. **Read Once, Remember**
   - Take notes in code comments when reading files
   - Reference line numbers: "As seen in file.py:123"
   - Don't re-read files unless they changed
   - Use session docs as memory (COMPACT-RESUME-POINT.md, SESSION-SUMMARY-2025-11-23.md)

3. **Batch Operations**
   - Multiple edits in one message (parallel tool calls)
   - Group related file reads together
   - Don't interleave reads and edits unnecessarily

4. **Reference, Don't Repeat**
   - Point to existing docs instead of re-explaining
   - Use approved plan sections by reference
   - "As documented in CHPC-IMPLEMENTATION.md section 7..."

5. **Incremental Validation**
   - Test after each phase, not at the end
   - Catch errors early (cheaper to fix)
   - Don't accumulate untested changes

### Response Structure

**Good:**
```
Executing Phase 1 (tech report review)...
[Uses Task agent for .tex review]
[Task agent returns findings]
Creating CONTRADICTIONS-REPORT.md...
[Single Write call]
✓ Phase 1 complete. Ready for Phase 2?
```

**Avoid:**
```
Let me read the tech report...
[Reads file 1]
Now let me read file 2...
[Reads file 2]
Let me think about this...
[Long reasoning]
Let me read file 1 again to check...
[Re-reads unnecessarily]
```

---

## For Human (John)

### Effective Prompts

**Specific:**
✅ "Continue Phase 1 from COMPACT-RESUME-POINT.md"
✅ "Review sections 2.3-2.5 of tech report for membership functions"
✅ "Update DATA_MANIFEST.json with approved schema from plan"

**Too vague:**
❌ "Keep going"
❌ "What's next?"
❌ "Continue the work"

### Token Budget Management

**Check periodically:**
```
"How many tokens have we used? What's our buffer?"
```

**Incremental approval if concerned:**
```
"Complete Phase 1 and pause. Don't start Phase 2 until I approve."
```

**Restart strategy:**
```
If tokens running low:
1. Pause current work
2. Git commit progress
3. Compact again
4. Resume with new COMPACT-RESUME-POINT.md
```

### Reference Documents, Not Raw Content

**Good:**
```
"Use the schema defined in SESSION-SUMMARY-2025-11-23.md"
"Follow the plan approved in previous session"
"Check CONTRADICTIONS-REPORT.md for issues"
```

**Avoid:**
```
[Pasting entire file contents]
[Repeating previously discussed details]
[Re-explaining decisions already made]
```

---

## Token Usage Targets

**Per Phase Estimates:**
- Phase 1 (Tech report): 8,000-10,000 tokens
- Phase 2 (Sync docs): 3,000-5,000 tokens
- Phase 3 (Schema impl): 12,000-15,000 tokens
- Phase 4 (Schedule): 2,000-3,000 tokens
- Phase 5 (Analytics): 8,000-10,000 tokens
- Phase 6 (Git): 1,000-2,000 tokens
- Phase 7 (CHPC): 5,000-8,000 tokens

**Total estimate:** 40,000-55,000 tokens
**Buffer needed:** 15,000 tokens (for iterations/fixes)
**Safe total:** 70,000 tokens

**Starting budget post-compact:** ~195,000 tokens (fresh slate)
**Plenty of headroom** ✓

---

## Session Structure Recommendations

### Option A: Complete All 7 Phases (Recommended)
- Execute phases 1-7 sequentially
- Test after phases 3, 5, 7
- Should fit in 60,000-70,000 tokens
- **Advantage:** Continuity, context retention

### Option B: Incremental Approval
- Execute Phase 1
- Pause for approval
- Execute Phase 2
- Pause for approval
- **Advantage:** Control, can inspect each phase
- **Disadvantage:** More back-and-forth, uses more tokens

### Option C: Batch by Type
- Research phases (1, 2) together
- Implementation phases (3, 4, 5) together
- Deployment phases (6, 7) together
- **Advantage:** Logical grouping
- **Disadvantage:** May need context switches

**Recommendation:** Option A, but pause after Phase 3 for validation.

---

## Quick Health Checks

**After each phase:**
```
✓ Phase complete
✓ Files created/modified (list)
✓ Tests pass (if applicable)
✓ Token usage: X of 200k (~Y% used)
✓ Ready for next phase
```

**If something feels off:**
```
🚨 Pause and ask:
- Are we still on plan?
- Have we deviated from approved approach?
- Do we need to revise strategy?
- Should we compact again?
```

---

## Emergency Procedures

### If Tokens Running Low (<20,000 remaining)

1. **Immediate:**
   - Stop current work
   - Git stash/commit progress
   - Create new COMPACT-RESUME-POINT.md
   - User compacts

2. **Prevention:**
   - Use more Task agents
   - Reference docs instead of re-explaining
   - Batch operations more aggressively

### If Plan Diverging

1. **Stop and reassess:**
   - Review COMPACT-RESUME-POINT.md
   - Check approved plan
   - Ask user if deviation is intentional

2. **Correct course:**
   - Return to approved approach
   - Document why deviation occurred
   - Update docs if plan needs revision

### If Errors Accumulating

1. **Don't pile on:**
   - Fix errors immediately
   - Test after each fix
   - Don't continue with broken state

2. **Root cause:**
   - Identify why error occurred
   - Fix underlying issue, not symptoms
   - Update docs to prevent recurrence

---

## Success Metrics

**End of session should have:**
- ✅ All 7 phases complete
- ✅ All tests passing
- ✅ Documentation updated
- ✅ Git commits ready
- ✅ < 70,000 tokens used
- ✅ No contradictions unresolved
- ✅ Ready for production testing

**If not all achieved:**
- Document what's complete
- Create new resume point
- Plan next session scope
