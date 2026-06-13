---
"@devicesdk/server": patch
---

Add audit findings as addressable batches and a `/pull` OpenCode command

- Added `audit/batch-*.md` files grouping security, code-quality, dependency,
  architecture, and documentation findings from the project-wide audit into
  small batches of 3–4 tasks each.
- Added `.opencode/commands/pull.md` so `/pull` checks out `main` and pulls the
  latest changes.
- Updated `AGENTS.md` to list the new `/pull` command alongside the other
  OpenCode slash commands.
