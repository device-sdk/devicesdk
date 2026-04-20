---
"@devicesdk/website": patch
---

Fix `/robots.txt` serving the Hugo-default `User-agent: *` line instead of the full policy file.

Root cause: `enableRobotsTXT = true` in `hugo.toml` made Hugo generate its built-in 14-byte default `robots.txt`, which on CI ended up winning over `apps/website/static/robots.txt` (282 bytes) in the final output. Setting `enableRobotsTXT = false` stops Hugo from touching `robots.txt`, so the static file is the only candidate.
