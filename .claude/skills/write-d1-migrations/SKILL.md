---
name: write-d1-migrations
description: Use when creating or modifying D1 database migrations in apps/api/migrations/. Covers file naming, SQL patterns, column types, constraints, indexes, and apply commands.
---

# Write D1 Migrations

## File Naming

Migrations live in `apps/api/migrations/` with sequential numbering:

```
NNNN_description.sql
```

Examples from the codebase:
- `0001_create_user_table.sql`
- `0005_add_devices_table.sql`
- `0010_add_description_and_managed_to_tokens.sql`

Check the latest migration number and increment by 1.

## CREATE TABLE Pattern

```sql
-- Create the things table
CREATE TABLE things (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    thing_slug TEXT NOT NULL,
    name TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, thing_slug)
);

CREATE INDEX idx_things_project_id ON things(project_id);
```

## Column Type Conventions

| Type | Usage | Examples |
|------|-------|---------|
| `TEXT PRIMARY KEY` | UUIDs generated with `crypto.randomUUID()` | `id` |
| `TEXT NOT NULL` | Required string fields | `user_id`, `project_id` |
| `TEXT` | Nullable string fields | `name`, `description` |
| `INTEGER NOT NULL` | Timestamps as epoch milliseconds (`Date.now()`) | `created_at`, `updated_at` |
| `INTEGER` | Nullable timestamps or numeric fields | `last_connected_at`, `expires_at` |
| `BOOLEAN NOT NULL DEFAULT 0` | Boolean flags (stored as 0/1) | `managed`, `verified_email` |

## Common Patterns

### Foreign Keys

Always use `ON DELETE CASCADE` for child records:

```sql
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
```

### Unique Constraints

Use composite unique constraints for slug-based lookups:

```sql
UNIQUE(project_id, device_slug)
UNIQUE(user_id, project_slug)
```

### Indexes

Create indexes on foreign key columns and frequent lookup columns:

```sql
CREATE INDEX idx_devices_project_id ON devices(project_id);
CREATE INDEX idx_device_scripts_device_id ON device_scripts(device_id);
```

### ALTER TABLE

For adding columns to existing tables:

```sql
ALTER TABLE tokens ADD COLUMN description TEXT;
ALTER TABLE tokens ADD COLUMN managed BOOLEAN NOT NULL DEFAULT 0;
```

## Existing Tables

Reference these for naming and structure conventions:
- `user` — `id`, `name`, `email`, `picture`, `verified_email`, `created_at`
- `user_sessions` — `user_id`, `token`, `expires_at`, `created_at`
- `projects` — `id`, `user_id`, `project_slug`, `name`, `description`, `created_at`, `updated_at`
- `devices` — `id`, `project_id`, `device_slug`, `name`, `description`, `current_version_id`, `last_connected_at`, `created_at`, `updated_at`
- `device_scripts` — `id`, `device_id`, `version_id`, `entrypoint`, `message`, `created_at`
- `tokens` — `id`, `user_id`, `token`, `created_at`, `description`, `managed`
- `cli_tokens` — `id`, `user_id`, `access_token_hash`, `expires_at`, `last_used_at`

## Type Definition

After creating a migration, add the corresponding table type in `apps/api/src/types.d.ts`:

```typescript
type tableThings = {
  id: string;
  project_id: string;
  thing_slug: string;
  name?: string;
  description?: string;
  status: string;
  created_at: number;
  updated_at: number;
};
```

## Apply Commands

```bash
# Apply locally (uses local D1 SQLite)
cd apps/api && npx wrangler d1 migrations apply DB --local

# Apply to remote (production D1)
cd apps/api && npx wrangler d1 migrations apply DB --remote
```

## Testing

After creating a migration:

1. Apply locally: `npx wrangler d1 migrations apply DB --local`
2. Run API tests: `pnpm test --filter @devicesdk/api`
3. Verify the migration file is picked up by `tests/apply-migrations.ts`

## Checklist

- [ ] File numbered sequentially (check last migration number)
- [ ] `TEXT PRIMARY KEY` for UUID id columns
- [ ] `INTEGER NOT NULL` for required timestamps (epoch ms)
- [ ] Foreign keys have `ON DELETE CASCADE`
- [ ] Indexes on foreign key and frequent lookup columns
- [ ] `NOT NULL` on all required fields
- [ ] Composite unique constraints for slug-based lookups
- [ ] Table type added to `apps/api/src/types.d.ts`
- [ ] Migration applies locally without errors
- [ ] API tests pass after migration
