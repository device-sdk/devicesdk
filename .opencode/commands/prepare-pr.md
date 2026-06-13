---
description: Prepare a reviewed PR for merge by rebasing, fixing findings, running gates, and pushing.
---

Follow `.opencode/skills/prepare-pr/SKILL.md` to prepare PR $ARGUMENTS for merge.
Ensure `.local/review.json` exists, rebase onto origin/main, fix all BLOCKER and
IMPORTANT findings, run the gates (build, lint, test, check-types), push with
`--force-with-lease`, and produce `.local/prep.md` + `.local/prep.env`.
