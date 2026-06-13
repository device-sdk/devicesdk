---
name: pr-workflow
description: Master guide for the PR review/prepare/merge workflow. Read this first when processing any PR. Defines triage order, required skill sequence, quality bar, and maintainer checkpoints.
---

# PR Workflow for Maintainers

Please read this in full and do not skip sections.
This is the single source of truth for the maintainer PR workflow.

## Triage Order

Process PRs **oldest to newest**. Older PRs are more likely to have merge conflicts and stale dependencies; resolving them first keeps the queue healthy and avoids snowballing rebase pain.

## Working Rule

Skills execute workflow. Maintainers provide judgment.
Always pause between skills to evaluate technical direction, not just command success.

These three skills must be used in order:

1. `review-pr` — review only, produce findings
2. `prepare-pr` — rebase, fix, gate, push to PR head branch
3. `merge-pr` — squash-merge, verify MERGED state, clean up

They are necessary, but not sufficient. Maintainers must steer between steps and understand the code before moving forward.

Treat PRs as reports first, code second.
If submitted code is low quality, ignore it and implement the best solution for the problem.

Do not continue if you cannot verify the problem is real or test the fix.

## PR Quality Bar

- Do not trust PR code by default.
- Do not merge changes you cannot validate with a reproducible problem and a tested fix.
- Keep types strict. Do not use `any` in implementation code.
- Keep external-input boundaries typed and validated, including CLI input, environment variables, network payloads, and tool output.
- Keep implementations properly scoped. Fix root causes, not local symptoms.
- Identify and reuse canonical sources of truth so behavior does not drift across the codebase.
- Harden changes. Always evaluate security impact and abuse paths.
- Understand the system before changing it. Never make the codebase messier just to clear a PR queue.
- No Cloudflare references in public-facing content (website, docs, user-visible strings).

## Rebase and Conflict Resolution

Before any substantive review or prep work, **always rebase the PR branch onto current `main` and resolve merge conflicts first**. A PR that cannot cleanly rebase is not ready for review — fix conflicts before evaluating correctness.

- During `prepare-pr`: rebase onto `main` as the first step, before fixing findings or running gates.
- If conflicts are complex or touch areas you do not understand, stop and escalate.
- Prefer **rebase** for linear history; **squash** when commit history is messy or unhelpful.

## Gate Policy

All PRs must pass these gates before merge:

```bash
pnpm install --frozen-lockfile   # In fresh worktrees
pnpm build                       # Full monorepo build
pnpm lint                        # Biome (server, api, simulation, core, cli) + ESLint (dashboard)
pnpm test --filter @devicesdk/server  # Server integration/unit tests
pnpm check-types                 # TypeScript type checking
```

- `pnpm build` and `pnpm lint` are always required.
- `pnpm test --filter @devicesdk/server` is required unless the PR is docs-only.
- `pnpm check-types` is always required.

## Commit Rules

- Follow concise, action-oriented commit messages (e.g., `api: add batch upload endpoint`).
- During `prepare-pr`, use concise subjects without PR numbers or thanks.
- Reserve `(#<PR>) thanks @<pr-author>` for the **final squash merge commit only**.
- Group related changes; avoid bundling unrelated refactors.

## Co-contributor Attribution

- If we squash, add the PR author as a co-contributor in the commit body using a `Co-authored-by:` trailer.
- When maintainer prepares and merges the PR, add the maintainer as an additional `Co-authored-by:` trailer too.
- For squash merges, the merge author should be the maintainer.
- When merging a PR: leave a PR comment that explains what was done and includes the merge SHA.

## Structured Review Handoff

Skills communicate via `.local/` artifacts:

- `.local/review.md` — Human-readable review (sections A-J)
- `.local/review.json` — Structured findings for `prepare-pr`
- `.local/prep.md` — Prepare log with changes and verification
- `.local/prep.env` — Prepared head SHA and metadata

### review.json Format

```json
{
  "recommendation": "READY FOR /prepare-pr",
  "findings": [
    {
      "id": "F1",
      "severity": "BLOCKER",
      "title": "Missing input validation",
      "area": "src/endpoints/things/createThing.ts",
      "fix": "Add Zod validation for the name field"
    }
  ],
  "tests": {
    "ran": ["pnpm test --filter @devicesdk/server"],
    "gaps": [],
    "result": "pass"
  },
  "docs": "not_applicable",
  "changelog": "not_required"
}
```

Severity levels:
- **BLOCKER** — Must be fixed before merge. Security issues, data loss, broken functionality.
- **IMPORTANT** — Should be fixed. Missing tests, poor error handling, type safety gaps.
- **NIT** — Nice to have. Style, naming, minor improvements.

## Pre-review Safety

- Use an isolated `.worktrees/pr-<PR>` checkout from `origin/main` when reviewing.
- Do not require a clean main checkout; do not run `git pull` in a dirty main checkout.
- PR review calls: prefer a single `gh pr view --json ...` to batch metadata/comments; run `gh pr diff` only when needed.

## Maintainer Checkpoints

### Before `prepare-pr`

- What problem are they solving?
- What is the most optimal implementation?
- Can we fix up everything?
- Do we have questions for the contributor?

### Before `merge-pr`

- Is this the most optimal implementation?
- Is code properly scoped?
- Is code properly reusing existing logic?
- Is code properly typed (no `any`)?
- Is code hardened against abuse?
- Enough tests? Regression tests needed?
- Tests real, no regressions, no performative tests?
- Security vulnerabilities introduced?

### After Merge

- Any deferred refactors needing follow-up issues?
- Broader architecture or test gaps revealed?

## Unified Workflow Summary

```
1. /review-pr <PR>
   ├── Checkout isolated worktree
   ├── Read PR metadata and diff
   ├── Analyze correctness, security, tests, docs
   ├── Produce .local/review.md + .local/review.json
   └── PAUSE — Maintainer evaluates findings

2. /prepare-pr <PR>
   ├── Rebase onto origin/main
   ├── Fix BLOCKER and IMPORTANT findings
   ├── Run gates (build, lint, test, check-types)
   ├── Push with --force-with-lease
   ├── Produce .local/prep.md + .local/prep.env
   └── PAUSE — Maintainer verifies readiness

3. /merge-pr <PR>
   ├── Validate artifacts from review + prepare
   ├── Check CI checks green
   ├── Squash merge with --match-head-commit
   ├── Add Co-authored-by trailers
   ├── Post PR comment with merge SHA
   └── Clean up worktree
```
