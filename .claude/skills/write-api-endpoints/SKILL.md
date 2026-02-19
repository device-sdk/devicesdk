---
name: write-api-endpoints
description: Use when creating or modifying API endpoints in apps/api/src/endpoints/. Covers Hono + Chanfana + Zod patterns, auth, validation, response format, router registration, and testing.
---

# Write API Endpoints

## Endpoint Class Structure

Every endpoint extends `OpenAPIRoute` from chanfana with a Zod-validated schema:

```typescript
import { ApiException, contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext } from "../../types";

export class CreateThing extends OpenAPIRoute {
  public schema = {
    tags: ["Things"],
    summary: "Create a new thing",
    operationId: "things-create",
    request: {
      params: z.object({
        projectId: z.string().min(1).max(36),
      }),
      body: contentJson(
        z.object({
          name: z.string().min(1).max(100),
          description: z.string().max(500).optional(),
        }),
      ),
    },
    responses: {
      "201": {
        description: "Returns the created thing",
        ...contentJson(
          z.object({
            success: z.boolean(),
            result: z.object({
              id: z.string(),
              name: z.string(),
              created_at: z.number(),
            }),
          }),
        ),
      },
      "404": { description: "Parent resource not found" },
      "409": { description: "Thing already exists" },
    },
  };

  public async handle(c: AppContext) {
    const user = c.get("user");
    const qb = c.get("qb");
    const data = await this.getValidatedData<typeof this.schema>();
    const { projectId } = data.params;

    // Implementation...

    return c.json({ success: true, result: { ... } }, 201);
  }
}
```

## Schema Patterns

- **Tags**: Group by resource — `["Devices"]`, `["Projects"]`, `["Scripts"]`, `["Tokens"]`
- **operationId**: `{resource}-{action}` — `devices-create`, `projects-list`
- **request.params**: Route parameters from URL (e.g., `:projectId`, `:deviceId`)
- **request.body**: Use `contentJson(z.object({...}))` for JSON request bodies
- **responses**: Always include success response and error codes (400, 404, 409, etc.)
- **Slug validation regex**: `/^[a-z][a-z0-9-]{0,35}$/` — lowercase alphanumeric with hyphens, starts with letter

## Auth and Context

```typescript
const user = c.get("user");    // Authenticated user object (id, email, name, etc.)
const qb = c.get("qb");        // D1QB query builder for database access
```

Auth is handled by middleware in `src/foundation/auth.ts`. Endpoints mounted after `authenticateUser` in `src/index.ts` automatically require auth.

## Validation

```typescript
const data = await this.getValidatedData<typeof this.schema>();
// Access validated fields:
const { projectId } = data.params;
const { name, description } = data.body;
```

Chanfana + Zod handles validation automatically. Invalid requests return 400 with schema errors.

## Database Queries (workers-qb)

```typescript
// Fetch one record
const project = await qb
  .fetchOne<tableProjects>({
    tableName: "projects",
    where: {
      conditions: ["user_id = ?1", "project_slug = ?2"],
      params: [user.id, projectId],
    },
  })
  .execute()
  .then((p) => p.results);

// Insert with returning
const newRecord = await qb
  .insert<tableDevices>({
    tableName: "devices",
    data: {
      id: crypto.randomUUID(),
      project_id: project.id,
      name: data.body.name || null,
      created_at: Date.now(),
      updated_at: Date.now(),
    },
    returning: "*",
  })
  .execute();

// Fetch all with ordering
const items = await qb
  .fetchAll<tableDevices>({
    tableName: "devices",
    where: {
      conditions: ["project_id = ?1"],
      params: [project.id],
    },
    orderBy: { created_at: "ASC" },
  })
  .execute()
  .then((r) => r.results?.results ?? []);
```

## Response Format

Always use this response shape:

```typescript
// Success
return c.json({ success: true, result: { ... } }, 200);
return c.json({ success: true, result: { ... } }, 201);

// Error
return c.json({ success: false, error: "Project not found" }, 404);
return c.json({ success: false, error: "Device already exists" }, 409);

// Internal errors — throw ApiException
throw new ApiException("Failed to create device");
```

## Router Registration

Each resource has a `router.ts` that maps HTTP methods to endpoint classes:

```typescript
// src/endpoints/things/router.ts
import { fromHono } from "chanfana";
import { Hono } from "hono";
import { CreateThing } from "./createThing";
import { DeleteThing } from "./deleteThing";
import { GetThing } from "./getThing";
import { ListThings } from "./listThings";
import { UpdateThing } from "./updateThing";

export const thingsRouter = fromHono(new Hono());

thingsRouter.get("/", ListThings);
thingsRouter.post("/", CreateThing);
thingsRouter.get("/:thingId", GetThing);
thingsRouter.put("/:thingId", UpdateThing);
thingsRouter.delete("/:thingId", DeleteThing);
```

Then mount in `src/index.ts` after the `authenticateUser` middleware:

```typescript
app.route("/v1/projects/:projectId/things", thingsRouter);
```

## Testing Pattern

Tests use `@cloudflare/vitest-pool-workers` with real Cloudflare Workers runtime:

```typescript
import { SELF, env } from "cloudflare:test";
import { D1QB } from "workers-qb";
import { beforeAll, describe, expect, it } from "vitest";
import { TEST_SESSION_TOKEN, TEST_PROJECT_ID } from "../setup-test-data";

describe.sequential("Things endpoint", () => {
  let qb: D1QB;

  beforeAll(async () => {
    qb = new D1QB(env.DB);
  });

  it("should create a new thing", async () => {
    const resp = await SELF.fetch(
      `http://localhost/v1/projects/${TEST_PROJECT_ID}/things`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TEST_SESSION_TOKEN}`,
        },
        body: JSON.stringify({ name: "My Thing" }),
      },
    );

    expect(resp.status).toBe(201);
    const json = await resp.json();
    expect(json.success).toBe(true);
    expect(json.result.name).toBe("My Thing");
  });

  it("should return 401 without auth", async () => {
    const resp = await SELF.fetch(
      `http://localhost/v1/projects/${TEST_PROJECT_ID}/things`,
    );
    expect(resp.status).toBe(401);
  });
});
```

## Existing Endpoint Resources

Reference these for patterns:
- `src/endpoints/projects/` — CRUD with slug validation
- `src/endpoints/devices/` — CRUD + WebSocket connect + firmware download
- `src/endpoints/scripts/` — Upload, deploy, batch operations
- `src/endpoints/tokens/` — API token management (mask token values, show `last_four`)
- `src/endpoints/user/` — Simple user details passthrough
- `src/endpoints/cli-auth/` — Device code OAuth flow for CLI

## Checklist

- [ ] Endpoint class extends `OpenAPIRoute`
- [ ] Schema has `tags`, `summary`, `operationId`, `request`, `responses`
- [ ] Uses `this.getValidatedData<typeof this.schema>()` for validation
- [ ] Auth via `c.get("user")`, DB via `c.get("qb")`
- [ ] Response uses `{ success: true, result }` or `{ success: false, error }`
- [ ] Router file created with `fromHono(new Hono())`
- [ ] Router mounted in `src/index.ts` (after auth middleware if protected)
- [ ] Test file uses `SELF.fetch()` with `describe.sequential`
- [ ] Test uses `TEST_SESSION_TOKEN` for auth
- [ ] IDs use `crypto.randomUUID()`, timestamps use `Date.now()`
