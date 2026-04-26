# PR Review Walkthrough - Portable Prompt Template

## Instructions for Claude

Use this prompt to get a structured, pedagogical PR review walkthrough:

---

**PROMPT:**

> I need you to help me review Pull Requests with a specific format that's concise, pedagogical, and actionable.
> 
> **Your Review Format Should Include:**
> 
> 1. **AI Code Review Section** - Act as a domain expert (e.g., "Frontend Expert", "Security Auditor", "Performance Engineer")
>    - List files changed with addition/deletion counts
>    - Explain what changed in plain language
>    - Analyze code quality with specific examples
>    - Identify potential issues with severity (✅ Good / ⚠️ Warning / ❌ Critical)
>    - Include code snippets showing before/after patterns
> 
> 2. **Testing Steps Section** - Provide exact commands and instructions
>    - Terminal commands to run
>    - WebStorm/IDE files to open for review
>    - Browser URLs to test
>    - Specific test cases with expected behavior
>    - Table format for multiple test scenarios (device sizes, inputs, etc.)
>    - What bugs to look for (with ❌ symbols)
> 
> 3. **Security/Quality Review** - Dedicated section for concerns
>    - Security vulnerabilities check
>    - Performance implications
>    - Accessibility issues
>    - Breaking changes
> 
> 4. **Recommendation Section**
>    - Clear risk level: ✅ LOW / ⚠️ MEDIUM / 🔴 HIGH
>    - Estimated test time
>    - Merge confidence percentage
>    - Exact merge commands to run
> 
> 5. **Pedagogical Explanations**
>    - Use "🎓 What You're Looking At:" sections
>    - Explain technical concepts in plain language
>    - Show translations of complex patterns
>    - Include context for why changes matter
> 
> **Format Requirements:**
> - Use emojis for visual scanning (✅ ⚠️ ❌ 🎯 🧪 🔍 🤖 📚 🎓)
> - Code blocks with syntax highlighting and comments
> - Clear headers with Markdown formatting
> - Bullet points and numbered lists
> - Tables for comparison/test matrices
> - Concise but complete - no fluff
> 
> **Review Process:**
> 1. First, check git/branch status to see what I've already done
> 2. Fetch PR details and files changed
> 3. Analyze the code changes
> 4. Provide the structured review above
> 5. After each merge, verify the state before moving to next PR
> 
> **Example Opening:**
> "## 🎯 PR #{number} REVIEW - {Title}
> 
> ### ✅ AI CODE REVIEW - {EXPERT PERSONA}
> 
> **Files Changed:** {count} ({types})
> - {filename} (+{add}, -{del})
> ..."
> 
> Start by checking the current git state and listing open PRs.

---

## Usage Examples

### Quick Review Session
```
"Review PR #45 using the format from PR-REVIEW-PROMPT-TEMPLATE.md"
```

### Speedrun Multiple PRs
```
"I need to review PRs #45, #46, #47 quickly before a meeting. 
Use the PR review format from PR-REVIEW-PROMPT-TEMPLATE.md and 
prioritize by risk level."
```

### Domain-Specific Review
```
"Review PR #52 as a security expert using the template format. 
Focus on authentication and data validation."
```

### With AI Personas
```
"Review these PRs using different expert personas:
- PR #33 (CSS changes) → Frontend Expert
- PR #31 (algorithm) → Senior Software Engineer  
- PR #22 (caching) → Performance Engineer
Use the review format from PR-REVIEW-PROMPT-TEMPLATE.md"
```

## Why This Format Works

1. **Scannable** - Emojis and formatting let you quickly assess risk
2. **Actionable** - Exact commands to copy/paste
3. **Educational** - Learn while reviewing (not just "approve/reject")
4. **Consistent** - Same structure every time = faster reviews
5. **Complete** - Covers code, testing, security, and merge steps
6. **Time-Boxed** - Clear time estimates for planning

## Customization

You can ask Claude to adjust the format:
- "Focus more on security"
- "Skip the pedagogy, just give me the commands"
- "Include more code examples"
- "Add a rollback section"
- "Compare to industry best practices"

## Integration with GitHub CLI

The format is designed to work with `gh` commands:
```bash
# Get PR info
gh pr view 33

# Checkout PR
gh pr checkout 33

# Get diff
gh pr diff 33

# Approve and merge (from Claude's recommendation)
gh pr review 33 --approve --body "Message"
gh pr merge 33 --squash --delete-branch
```

## Notes

- Template created: 2025-10-28
- Based on successful reviews of PRs #33 (responsive CSS) and #32 (Easter Eggs refactor)
- Works best when Claude has access to GitHub MCP server tools
- Pairs well with PR-REVIEW-SPEEDRUN.md for time-constrained reviews
