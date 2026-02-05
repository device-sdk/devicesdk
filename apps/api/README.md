# DeviceSDK API

Cloudflare Workers API using Hono + Chanfana with auto-generated OpenAPI schema.

## Development

From the monorepo root:

```bash
pnpm dev --filter @devicesdk/api
```

## Testing

```bash
pnpm test --filter @devicesdk/api
```

Run a single test file:

```bash
cd apps/api && npx vitest run --config tests/vitest.config.mts tests/integration/devices.test.ts
```

## Database Migrations

```bash
cd apps/api && npx wrangler d1 migrations apply DB --local    # Local
cd apps/api && npx wrangler d1 migrations apply DB --remote   # Production
```

## Build & Deploy

```bash
pnpm build --filter @devicesdk/api
cd apps/api && npx wrangler deploy
```

## Project Structure

- `src/index.ts` — Main router, auth middleware, route mounting
- `src/endpoints/` — Endpoint classes (extend `OpenAPIRoute` with Zod schemas)
- `src/foundation/auth.ts` — Authentication middleware
- `src/durableObjects/` — Durable Objects for WebSocket device connections
- `tests/` — Integration tests using `@cloudflare/vitest-pool-workers`
