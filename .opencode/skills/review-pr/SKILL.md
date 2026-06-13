---
name: review-pr
description: Read-only PR review producing structured findings. Use as the first step in the PR workflow. Produces .local/review.md and .local/review.json for handoff to prepare-pr.
---

# Review PR

Read-only analysis of a pull request. Do not modify code or switch branches during review.

## Prerequisites

- PR URL or number is known
- You have read `.opencode/skills/pr-workflow/SKILL.md`

## Steps

### 1. Setup Isolated Worktree

```bash
# Fetch latest
git fetch origin

# Create isolated worktree for review
git worktree add .worktrees/pr-<PR> origin/main

# Work inside the worktree
cd .worktrees/pr-<PR>
```

If the worktree already exists, remove and recreate it:
```bash
git worktree remove .worktrees/pr-<PR> --force
git worktree add .worktrees/pr-<PR> origin/main
```

### 2. Gather PR Metadata

```bash
# Get PR metadata (batch into one call)
gh pr view <PR> --json number,title,author,body,headRefName,baseRefName,state,labels,reviewDecision,mergeable,commits,comments

# Get the diff
gh pr diff <PR>
```

Save metadata to `.local/`:
```bash
mkdir -p .local
gh pr view <PR> --json number,title,author,body,headRefName,baseRefName,state > .local/pr-meta.json
```

### 3. Claim the PR

```bash
gh pr edit <PR> --add-assignee @me
```

### 4. Analyze the Diff

Review the PR diff for:

**A. Metadata** — PR number, title, author, base branch, labels
**B. Scope** — What files changed, what's the blast radius
**C. Correctness** — Does the code do what it claims? Edge cases handled?
**D. Security** — Input validation, auth checks, injection risks, abuse paths
**E. Types** — Strict types used? No `any` in implementation? Boundaries validated?
**F. Tests** — Adequate coverage? Real assertions, not performative? Regression tests?
**G. API Compatibility** — Breaking changes to endpoints, response shapes, or schemas?
**H. Docs** — User-facing changes documented? Public content clean of Cloudflare references?
**I. Performance** — N+1 queries? Unbounded fetches? Missing indexes?
**J. Style** — Follows codebase conventions? Consistent with existing patterns?

### 5. Run Local Tests (Optional)

If the PR touches API code, optionally run tests to verify:

```bash
cd .worktrees/pr-<PR>
pnpm install --frozen-lockfile
pnpm test --filter @devicesdk/server
```

### 6. Produce Review Artifacts

Create `.local/review.md` with sections A through J:

```markdown
# PR Review: #<PR> — <title>

## A. Metadata
- **Author**: @<author>
- **Branch**: <head> → <base>
- **Files changed**: <count>

## B. Scope
<summary of what changed and why>

## C. Correctness
<analysis>

## D. Security
<analysis>

## E. Types
<analysis>

## F. Tests
<analysis>

## G. API Compatibility
<analysis>

## H. Docs
<analysis>

## I. Performance
<analysis>

## J. Style
<analysis>

## Recommendation
<READY FOR /prepare-pr | NEEDS WORK | CLOSE>
```

Create `.local/review.json` with structured findings:

```json
{
  "recommendation": "READY FOR /prepare-pr",
  "findings": [
    {
      "id": "F1",
      "severity": "BLOCKER",
      "title": "Short description",
      "area": "path/to/file.ts",
      "fix": "What needs to change"
    }
  ],
  "tests": {
    "ran": ["pnpm test --filter @devicesdk/server"],
    "gaps": ["No test for error case"],
    "result": "pass"
  },
  "docs": "not_applicable",
  "changelog": "not_required"
}
```

### 7. Report to Maintainer

Present findings summary and recommendation. Wait for maintainer judgment before proceeding to `prepare-pr`.

## Severity Guide

- **BLOCKER**: Must fix. Security vulnerabilities, data loss, broken core functionality, type unsafety at boundaries.
- **IMPORTANT**: Should fix. Missing tests, poor error handling, wrong abstractions, missing validation.
- **NIT**: Optional. Naming, style, minor improvements that don't affect correctness.

## Rules

- **Read-only**: Do not modify any code during review.
- **Do not switch branches**: Stay in the worktree or use `gh` commands.
- **Batch API calls**: Use `--json` flags to minimize GitHub API calls.
- **Be specific**: Every finding must include the file path and a concrete fix suggestion.
- **Be honest**: If you cannot verify something, say so. Don't guess.

## Checklist

- [ ] Worktree created at `.worktrees/pr-<PR>`
- [ ] PR metadata saved to `.local/pr-meta.json`
- [ ] PR claimed with `--add-assignee`
- [ ] Diff analyzed for all sections (A-J)
- [ ] `.local/review.md` produced with full analysis
- [ ] `.local/review.json` produced with structured findings
- [ ] Recommendation clearly stated
- [ ] Findings have severity, area, and fix suggestion
