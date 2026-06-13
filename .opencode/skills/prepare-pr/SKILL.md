---
name: prepare-pr
description: Prepare a reviewed PR for merge. Rebases onto main, fixes BLOCKER and IMPORTANT findings, runs gates, and pushes. Use after review-pr produces artifacts.
---

# Prepare PR

Prepare a reviewed PR for merge by resolving findings, running gates, and pushing.

## Prerequisites

- `review-pr` has been run and produced `.local/review.md` + `.local/review.json`
- Maintainer has approved moving forward after reviewing findings
- You are in the `.worktrees/pr-<PR>` directory

## Steps

### 1. Validate Review Artifacts

```bash
cd .worktrees/pr-<PR>

# Verify review artifacts exist
cat .local/review.json
cat .local/review.md
```

Confirm the recommendation is `READY FOR /prepare-pr`. If it says `NEEDS WORK` or `CLOSE`, stop and report to maintainer.

### 2. Fetch PR Branch and Rebase

```bash
# Fetch the PR branch
gh pr checkout <PR>

# Rebase onto latest main
git fetch origin main
git rebase origin/main
```

If rebase conflicts occur:
- Resolve conflicts carefully, understanding both sides
- If conflicts are complex or in areas you don't understand, stop and escalate
- After resolving: `git rebase --continue`

### 3. Fix Findings

Read `.local/review.json` and fix all **BLOCKER** and **IMPORTANT** findings:

- Fix each finding in the appropriate file
- Use concise commit messages without PR numbers (e.g., `api: add input validation for name field`)
- Group related fixes into single commits
- Skip NIT findings unless trivially fixable alongside other changes

### 4. Run Gates

```bash
# Install dependencies (fresh worktree)
pnpm install --frozen-lockfile

# Build
pnpm build

# Lint
pnpm lint

# Tests (skip only if PR is docs-only)
pnpm test --filter @devicesdk/server

# Type check
pnpm check-types
```

All gates must pass. If a gate fails:
- Fix the issue
- Commit the fix
- Re-run the failing gate
- Do not skip gates

### 5. Push

```bash
# Push with lease protection
git push --force-with-lease
```

If push is rejected:
- Someone else may have pushed to the PR branch
- Fetch and rebase again, then retry
- Never use `--force` (only `--force-with-lease`)

### 6. Produce Prepare Artifacts

Create `.local/prep.md`:

```markdown
# PR Prepare: #<PR> — <title>

## Changes Made
- <list of fixes applied>

## Gates
- [x] pnpm install --frozen-lockfile
- [x] pnpm build
- [x] pnpm lint
- [x] pnpm test --filter @devicesdk/server
- [x] pnpm check-types

## Findings Resolved
- F1 (BLOCKER): <title> — Fixed in <commit>
- F2 (IMPORTANT): <title> — Fixed in <commit>

## Head SHA
<sha>

## Status
Ready for /merge-pr
```

Create `.local/prep.env`:

```bash
PREP_HEAD_SHA=<current HEAD sha>
PREP_BRANCH=<branch name>
PREP_AUTHOR=<PR author>
PREP_TIMESTAMP=<ISO timestamp>
```

### 7. Report to Maintainer

Present:
- Summary of changes made
- Gate results (all passing)
- Findings resolved
- Current HEAD SHA
- Recommendation: "PR is ready for `/merge-pr`"

Wait for maintainer judgment before proceeding to `merge-pr`.

## Rules

- **Rebase first**: Always rebase onto `origin/main` before any other work.
- **Fix findings**: All BLOCKER and IMPORTANT findings must be resolved.
- **All gates must pass**: No exceptions. Fix issues, don't skip gates.
- **Scoped commits**: Each commit should address a specific finding or change.
- **No PR numbers in commit subjects**: Reserve PR references for the final squash commit.
- **Force-with-lease only**: Never `git push --force`.

## Checklist

- [ ] Review artifacts validated (`.local/review.json` exists, recommendation is READY)
- [ ] PR branch checked out and rebased onto `origin/main`
- [ ] All BLOCKER findings fixed
- [ ] All IMPORTANT findings fixed
- [ ] `pnpm install --frozen-lockfile` succeeded
- [ ] `pnpm build` passed
- [ ] `pnpm lint` passed
- [ ] `pnpm test --filter @devicesdk/server` passed
- [ ] `pnpm check-types` passed
- [ ] Pushed with `--force-with-lease`
- [ ] `.local/prep.md` produced
- [ ] `.local/prep.env` produced with HEAD SHA
