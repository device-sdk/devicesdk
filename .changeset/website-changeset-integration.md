---
"@devicesdk/website": patch
---

Align `@devicesdk/website` changeset integration with the rest of the monorepo.

- Fill in package metadata (`description`, `author`, `homepage`, `bugs`,
  `repository`, `keywords`) so the website package is documented the same way
  as `@devicesdk/cli`.
- Add a dedicated "Changesets" section to `AGENTS.md` explaining public vs
  private packages and the website's changelog-only lifecycle.
- Update `.changeset/README.md` and the feature skill to mention website
  changesets.
