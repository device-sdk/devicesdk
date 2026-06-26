# Database migrations

Sequential SQL migrations run by `src/db/migrate.ts`. The runner records each
filename in the `migrations` table and only applies files it has not yet seen.

## Numbering note

Migration `0003` was intentionally left unused during the self-host refactor to
avoid renumbering already-applied migrations on existing installs. New files
should continue the sequence from the highest existing number; do not reuse
`0003`.

## Adding a migration

1. Create `NNNN_descriptive_name.sql` with the next available number.
2. Keep migrations idempotent where possible (e.g., `CREATE TABLE IF NOT EXISTS`).
3. Do **not** run migration SQL through `workers-qb` Query objects - the query
   builder trims newlines, which breaks `--` comments. Use `db.exec()` directly.
