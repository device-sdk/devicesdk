---
description: Squash-merge a prepared PR with SHA pinning and co-author attribution.
---

Follow `.opencode/skills/merge-pr/SKILL.md` to squash-merge PR $ARGUMENTS.
Validate prep artifacts, verify required CI checks are green, merge with
`--match-head-commit`, include `Co-authored-by` trailers, post a PR comment with
the merge SHA, and clean up the worktree.
