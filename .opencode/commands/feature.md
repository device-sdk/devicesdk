---
description: Implement a feature from a file or instruction, auto-review and fix in a loop, then open a PR.
---

Follow `.opencode/skills/feature/SKILL.md` and implement the feature described
by `$ARGUMENTS`.

`$ARGUMENTS` is either a path to a spec/instruction file or a free-form
instruction. Create a dedicated worktree and branch, delegate implementation to
a subagent, review the result, fix BLOCKER/IMPORTANT findings in a loop, run
all gates, and finish by opening a PR into `main`.
