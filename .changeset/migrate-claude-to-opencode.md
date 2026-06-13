---
"@devicesdk/cli": patch
"@devicesdk/dashboard": patch
"@devicesdk/website": patch
---

Migrate CLAUDE.md and `.claude/skills/` to `AGENTS.md` and OpenCode-compatible `.opencode/skills/` and `.opencode/commands/`. `devicesdk init` now scaffolds `AGENTS.md` only (no longer `CLAUDE.md`), and MCP docs mention OpenCode alongside Claude and Cursor. Also hardens CI: dashboard E2E tests retry once in CI, pnpm install is retried after clearing the store, release builds have Bun available, and firmware rolling releases recreate immutable releases.
