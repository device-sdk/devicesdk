---
"@devicesdk/server": patch
---

Add audit findings as addressable batches, plus `/pull` and `/feature` OpenCode commands

- Added `audit/batch-*.md` files grouping security, code-quality, dependency,
  architecture, and documentation findings from the project-wide audit into
  small batches of 3–4 tasks each.
- Added `.opencode/commands/pull.md` so `/pull` checks out `main` and pulls the
  latest changes.
- Added `.opencode/commands/feature.md` and `.opencode/skills/feature/SKILL.md`
  so `/feature <path-or-instruction>` delegates implementation to a subagent,
  auto-reviews and fixes BLOCKER/IMPORTANT findings in a loop, and opens a PR.
- Updated `AGENTS.md` to list the new `/pull` and `/feature` commands alongside
  the other OpenCode slash commands.
