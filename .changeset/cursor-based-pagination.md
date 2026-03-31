---
"@devicesdk/api": minor
"@devicesdk/cli": minor
---

Add cursor-based pagination to ListProjects, ListDevices, and ListApiTokens endpoints. Response format changes from a flat array to `{ items: [...], next_cursor: string | null }`. Both the dashboard and CLI auto-paginate to fetch all pages transparently.
