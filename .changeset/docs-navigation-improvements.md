---
"@devicesdk/website": patch
---

Improve docs discoverability and navigation.

- The docs sidebar is now generated from `content.json`, so it stays in sync
  with every page under `docs/public/`.
- Sections can be expanded/collapsed and the active section is opened
  automatically.
- Added previous/next links at the bottom of every docs page.
- Docs landing and section landing pages now show auto-generated card grids
  for their child pages instead of hand-curated, easy-to-stale lists.
- Added the missing `/docs/guides/` section index.
- Fixed broken or outdated links on the docs landing page (e.g. changelog URL).
- Made the sidebar and table-of-contents panes scrollable on desktop.
- Fixed mobile layout issues: docs content no longer overflows the viewport,
  tables scroll horizontally, and the mobile sidebar/TOC drawers use the
  dynamic viewport height so they fill the screen on browsers with collapsing
  toolbars.
