---
name: merge-pr
description: Deterministic squash merge of a prepared PR. Validates artifacts, checks CI, squash merges with SHA pinning and co-author attribution, posts PR comment, and cleans up. Use after prepare-pr.
---

# Merge PR

Deterministic squash merge with strict gating, SHA pinning, and attribution.

## Prerequisites

- `review-pr` has produced `.local/review.md` + `.local/review.json`
- `prepare-pr` has produced `.local/prep.md` + `.local/prep.env`
- Maintainer has approved moving forward after reviewing prep results
- All gates passed during prepare

## Steps

### 1. Validate Artifacts

```bash
cd .worktrees/pr-<PR>

# Load prep environment
source .local/prep.env

# Verify required variables
echo "HEAD SHA: $PREP_HEAD_SHA"
echo "Branch: $PREP_BRANCH"
echo "Author: $PREP_AUTHOR"
```

Confirm all variables are set. If any are missing, stop and re-run `prepare-pr`.

### 2. Go/No-Go Checklist

Before proceeding, verify:

- [ ] All BLOCKER and IMPORTANT findings from review.json are resolved
- [ ] Verification is meaningful (not just "tests pass" — the fix actually addresses the problem)
- [ ] Required CI checks are green
- [ ] Branch is not behind `main` (rebase was done in prepare)
- [ ] PREP_HEAD_SHA matches current PR head

Check CI status:
```bash
gh pr checks <PR>
```

If required checks are failing, stop and investigate. Do not merge with failing checks.

### 3. Squash Merge

```bash
# Get PR author info for co-author trailer
PR_AUTHOR_NAME=$(gh pr view <PR> --json author --jq '.author.login')

# Squash merge with SHA pinning
gh pr merge <PR> \
  --squash \
  --match-head-commit "$PREP_HEAD_SHA" \
  --subject "<concise summary> (#<PR>)" \
  --body "$(cat <<'EOF'
<description of what this PR does>

Co-authored-by: <PR author name> <PR author email>
Co-authored-by: <maintainer name> <maintainer email>
EOF
)"
```

Key flags:
- `--squash` — Squash all commits into one
- `--match-head-commit` — Ensures we merge exactly the SHA we reviewed (prevents TOCTOU)

### 4. Handle Merge Failures

If merge fails due to `--match-head-commit` mismatch:
- Someone pushed to the PR branch after prepare
- Go back to `prepare-pr` and re-run

If merge fails for other reasons:
- Check branch protection rules
- Check CI status
- Report to maintainer

### 5. Verify Merge

```bash
# Confirm PR is in MERGED state (not just CLOSED)
gh pr view <PR> --json state --jq '.state'
# Must output: "MERGED"

# Get the merge commit SHA
MERGE_SHA=$(gh pr view <PR> --json mergeCommit --jq '.mergeCommit.oid')
echo "Merge SHA: $MERGE_SHA"
```

The PR must be in `MERGED` state, not `CLOSED`. If it shows `CLOSED`, something went wrong — investigate immediately.

### 6. Post PR Comment

```bash
gh pr comment <PR> --body "$(cat <<EOF
Merged in $MERGE_SHA.

Changes:
- <summary of what was done>

Thanks @$PR_AUTHOR_NAME for the contribution!
EOF
)"
```

### 7. Clean Up

```bash
# Return to main repo
cd /home/gabriel/PycharmProjects/devicesdk-monorepo

# Remove the worktree
git worktree remove .worktrees/pr-<PR>

# Update local main
git fetch origin main
git checkout main
git pull origin main
```

Only clean up after confirming the PR is in `MERGED` state.

## Safety Rules

- **Never use `gh pr merge --auto`** — merge only after manual verification.
- **Never run `git push` directly** — merging is done via `gh pr merge`.
- **Require `--match-head-commit`** — prevents merging unexpected changes.
- **Must end in MERGED state** — never CLOSED. Verify after merge.
- **Clean up only after confirmed merge** — never delete worktree before verification.
- **Co-author trailers are required** — always attribute the PR author and maintainer.

## Checklist

- [ ] Prep artifacts validated (`.local/prep.env` has PREP_HEAD_SHA)
- [ ] Go/no-go checklist passed
- [ ] CI checks green
- [ ] Squash merged with `--match-head-commit` for SHA pinning
- [ ] Merge commit includes `Co-authored-by` trailers
- [ ] PR state verified as `MERGED` (not CLOSED)
- [ ] Merge SHA recorded
- [ ] PR comment posted with merge SHA and thanks
- [ ] Worktree cleaned up
- [ ] Local main updated
