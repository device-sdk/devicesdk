---
name: feature
description: Implement a feature from a file or instruction, then auto-review and fix in a loop until clean, and open a PR. Trigger with /feature <path-or-instruction>.
---

# Feature Workflow

End-to-end feature implementation: read the request, implement in an isolated
worktree, review, fix findings in a loop, and open a PR.

## Overview

1. Parse the incoming argument (file path or free-form instruction).
2. Create a dedicated worktree + branch per the repo Git workflow.
3. Delegate implementation to a `general` subagent.
4. Review the result like `/review-pr` would.
5. While there are BLOCKER or IMPORTANT findings, delegate fixes to a `general`
   subagent and re-review.
6. Run gates (build, lint, type-check, tests).
7. Push and open a PR.

## Step 1 — Parse the Request

The command argument (`$ARGUMENTS`) is either:

- A path to a file containing the feature spec/instruction, e.g.
  `/feature audit/batch-01-critical-safety.md` or `/feature ./docs/spec.md`.
- A free-form instruction, e.g. `/feature add a /health endpoint to the server`.

Determine which it is:

- If the argument starts with `.`, `/`, `~/`, or is an existing relative file
  path, read the file.
- Otherwise treat the whole argument as the instruction text.

Derive a short, kebab-case feature name from the first line of the instruction
or filename. Use it for the branch and worktree names.

## Step 2 — Create Worktree and Branch

From the repo root:

```bash
git fetch origin
git worktree add .worktrees/<feature-name> -b <feature-name>
cd .worktrees/<feature-name>
```

If the worktree or branch already exists, remove/recreate or reuse as
appropriate, but never modify a branch you did not create.

## Step 3 — Implement with a Subagent

Delegate the implementation to a `general` subagent with this prompt:

```
Implement the following feature in the DeviceSDK monorepo worktree at
<absolute-path-to-worktree>.

Feature instruction:
---
<paste full instruction here>
---

Requirements:
- Follow AGENTS.md exactly (worktree usage, changesets, lint, tests, coding standards).
- Make minimal, focused changes.
- Create a changeset early with `pnpm changeset` referencing every workspace
  package touched, including `@devicesdk/website` for docs or marketing-site
  changes.
- Run `pnpm install` if node_modules is missing, then `pnpm build`,
  `pnpm lint`, `pnpm check-types`, and relevant tests.
- Do NOT open a PR; just finish the implementation and report what changed.
- If you need clarification, stop and ask the main agent instead of guessing.
```

Wait for the subagent to finish. Trust its output but verify the worktree
exists and has commits.

## Step 4 — Review the Implementation

Inside the feature worktree, perform a read-only review as if running
`/review-pr` on the branch. You may either:

- Use the `review-pr` skill (load it via the skill tool), or
- Run the review yourself by inspecting the diff against `origin/main`.

Produce:

- `.local/review.md` with sections A–J and a recommendation.
- `.local/review.json` with structured findings, each having:
  - `id`, `severity` (BLOCKER | IMPORTANT | NIT), `title`, `area`, `fix`

Severity guide:

- **BLOCKER**: Security vulnerabilities, data loss, broken core functionality,
  type unsafety at boundaries.
- **IMPORTANT**: Missing tests, poor error handling, wrong abstractions,
  missing validation.
- **NIT**: Naming, style, minor improvements.

## Step 5 — Fix Findings in a Loop

Read `.local/review.json`:

- If there are BLOCKER or IMPORTANT findings, delegate fixes to a `general`
  subagent with:
  ```
  Fix the following review findings in the worktree at <path>.
  Findings:
  <paste BLOCKER and IMPORTANT findings>

  Rules:
  - Do NOT change unrelated logic.
  - Run `pnpm lint` and relevant tests after fixing.
  - Commit each fix group with a concise conventional commit message.
  - Do NOT open a PR.
  ```
- After the fix subagent returns, re-run the review (Step 4).
- Repeat until `.local/review.json` contains no BLOCKER or IMPORTANT findings.

Stop after a reasonable number of iterations (e.g., 5). If findings persist,
report to the user instead of looping forever.

## Step 6 — Run Final Gates

Inside the feature worktree:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm check-types
pnpm test --filter @devicesdk/server
```

If any gate fails, delegate fixes to a `general` subagent and re-run gates.

## Step 7 — Push and Open PR

```bash
git push -u origin <feature-name>
```

Then create a PR with `gh pr create --base main` using a descriptive title and
body that summarize the feature and reference the original instruction/spec.

## Rules

- Never commit directly to `main`.
- Never work in the main checkout.
- Do not create/modify worktrees or branches you did not create.
- Always create a changeset for package changes.
- Run `pnpm lint` before committing.
- Use `--force-with-lease` if you ever need to push after amending; avoid
  `--force`.
- Keep the user informed at each major phase (implementation done, review
  findings, fixes applied, gates passed, PR opened).

## Checklist

- [ ] Instruction parsed and feature name derived
- [ ] Worktree and branch created at `.worktrees/<feature-name>`
- [ ] Implementation delegated to a `general` subagent
- [ ] Review artifacts produced in `.local/review.md` and `.local/review.json`
- [ ] All BLOCKER and IMPORTANT findings addressed (or user notified)
- [ ] Final gates pass: build, lint, type-check, tests
- [ ] Branch pushed
- [ ] PR opened against `main`
