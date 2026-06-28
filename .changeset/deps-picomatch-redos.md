---
"@devicesdk/cli": patch
---

Security: pin picomatch to >=2.3.2 (via a pnpm override) to clear a HIGH ReDoS
advisory (GHSA-c2c7-rcm5-vvqj) that reached the CLI transitively through
chokidar. A second range-scoped override (>=4.0.0 <4.0.4 -> 4.0.4) clears the
same advisory on the 4.x branch used by build tooling.
