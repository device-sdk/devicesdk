# Plan 003: Bundle a stateless Streamable-HTTP MCP server into apps/server at /mcp with OAuth 2.1 auth

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 321ef7e..HEAD -- apps/server/src apps/server/migrations apps/server/tests packages/cli/src/commands/init.ts packages/mcp docs/public/mcp.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Repo rule that overrides habit**: this repo forbids em-dashes in all text
> you write (code comments, docs, changesets). Use " - ", a colon, or a
> semicolon. See `CLAUDE.md` "Coding Standards".

## Status

- **Priority**: P1
- **Effort**: L (phased; each phase is independently shippable and verifiable)
- **Risk**: MED (new auth surface; mitigated by reusing the existing token
  system and keeping OAuth additive)
- **Depends on**: none. Interacts with plan 002 Phase 1 (see Maintenance notes).
- **Category**: direction / dx
- **Planned at**: commit `321ef7e`, 2026-07-05

## Why this matters

Today the MCP story is `@devicesdk/mcp`, an npm stdio package that shells out
to the `devicesdk` CLI. That means every agent host needs Node + npx + the CLI
installed and logged in, tool behavior depends on the user's shell setup, and
the package must be versioned/published separately from the server it talks to.

The server is a single always-on Bun process that users already run and already
discover over mDNS (`devicesdk.local`). Bundling a **stateless Streamable-HTTP
MCP endpoint at `/mcp`** into that process means: zero install (point any
MCP-aware agent at `http://devicesdk.local:8080/mcp`), tools always match the
server version, and auth becomes a first-class server concern instead of
"inherit whatever the CLI wrote to disk". OAuth 2.1 with dynamic client
registration is what makes the UX "paste the URL, a browser consent screen
pops up, click Approve" in Claude Code, Cursor, VS Code, etc. The consent
approval mints a revocable API token (visible in the dashboard Tokens page)
that expires after 30 days, which is exactly the "user creates an api token
for this" flow the owner asked for. Manually created API tokens keep working
as a static Bearer alternative; OAuth is the recommended path. The npm package
is removed outright - the owner confirmed no users rely on it yet.

## Current state

Facts you need, all verified at commit `321ef7e`:

### Server layout

- `apps/server/src/index.ts` - the Hono app. Route mounting pattern (lines
  120-183): unauthenticated routes first, then
  `app.use("/v1/*", authenticateUser)` at line 167, then authed routers, then
  `app.get("*", serveSpa)` **last** (line 183, SPA catch-all - anything you
  mount must be registered before it). The CLI approval page is mounted like
  this (lines 134-135):

  ```ts
  app.get("/cli/auth", cliAuthUser, getApprovalPage);
  app.post("/cli/auth", cliAuthUser, handleApproval);
  ```

- `apps/server/src/server.ts` - boot: loadConfig, SQLite WAL, applyMigrations,
  services object (`SCRIPTS`, `FIRMWARES`, `DEVICE`, `qb`, `DB`, `ENV`,
  `config`, `server`), `Bun.serve({ fetch: (req) => app.fetch(req, services), websocket })`.
- `apps/server/src/foundation/auth.ts` - `authenticateUser` middleware:
  Bearer header or session cookie; `dsdk_*` tokens hit `cli_tokens`, everything
  else tries `user_sessions` then hashed `tokens`. On missing credentials it
  returns a plain 401 JSON `Response` (lines 126-139) with **no
  `WWW-Authenticate` header** (OAuth discovery needs one on `/mcp`).
  `cliAuthUser` (line 111) wraps it and redirects browsers to the dashboard
  login with a safe `redirect_uri` - reuse this exact middleware for the OAuth
  consent page.
- `apps/server/src/foundation/tokenHash.ts` - `hashToken(token, secret)`,
  HMAC-SHA-256 with `config.apiTokenSecret`.
- `apps/server/src/endpoints/tokens/createApiToken.ts` - the pattern for
  minting an API token (lines 74-92): raw token = `crypto.randomUUID().replaceAll("-", "")`,
  store `token_hash` + `last_four` + optional `description` in `tokens`.
  The `tokens` table already has a `managed BOOLEAN NOT NULL DEFAULT 0` column
  (migration `0010_add_description_and_managed_to_tokens.sql`); the token
  count limit in createApiToken excludes managed tokens
  (`(managed = 0 OR managed IS NULL)`), and `listApiTokens.ts` already returns
  `managed` so the dashboard shows these. **OAuth access tokens in this plan
  are managed API tokens** - no new token type, revocation for free via the
  existing dashboard Tokens page and `DELETE /v1/tokens/:tokenId`. The
  `tokens` table has **no expiry column today** and `authenticateUser` does
  no expiry check on API tokens; this plan adds a nullable `expires_at`
  (NULL = never expires, preserving all existing tokens' behavior) so
  OAuth-minted tokens can be capped at 30 days.
- `apps/server/src/endpoints/cli-auth/` - the device-code flow. `approvalPage.ts`
  is the exemplar for a server-rendered auth consent page: `hono/html`
  `renderPage()` card UI, CSRF cookie (`cli_csrf`, SameSite=Strict, 10 min),
  `escapeHtml`, POST handler validating the CSRF token. Match its style for
  the OAuth consent page.
- `apps/server/src/foundation/rateLimit.ts` - `rateLimitMiddleware(max, windowMs)`,
  in-memory fixed window keyed by client IP + path. Applied per-route in
  `index.ts` (e.g. `app.use("/v1/auth/login", rateLimitMiddleware(20, 60_000))`).
- `apps/server/src/janitor.ts` - hourly cleanup (expired sessions, CLI codes,
  old logs). Add expired OAuth authorization-code cleanup here.
- `apps/server/migrations/` - sequential SQL files; latest is
  `0026_drop_tokens_plaintext_column.sql`, so the new one is `0027_*`.
  **Never run migration SQL through workers-qb Query objects** (see
  TROUBLESHOOT.md - `trimQuery()` corrupts `--` comments); the migration
  runner `src/db/migrate.ts` handles them correctly.
- `apps/server/src/types.d.ts` - table type definitions (`tableTokens`,
  `tableUserSessions`, ...). Add the new OAuth table types here.
- Response convention: `{ "success": true, "result": ... }` /
  `{ "success": false, "error": "...", code?, docs? }`. Note: OAuth endpoints
  are the one deliberate exception - RFC 6749 mandates its own error shape
  (`{ "error": "invalid_grant", ... }`), and MCP clients expect it. Keep the
  RFC shape on `/oauth/token` and `/oauth/register`.
- mDNS: `apps/server/src/foundation/mdns/` advertises `devicesdk.local`
  (config `mdnsHostname`, default `"devicesdk"`, port from `config.port`,
  default 8080). Nothing to change there - the /mcp endpoint rides on the
  same host and port, so `http://devicesdk.local:8080/mcp` works by default.
- OpenAPI: chanfana generates `/api-docs` from chanfana route classes only.
  Mount /mcp and /oauth as **plain Hono handlers** (like `handleLogin`), so
  they stay out of the REST OpenAPI spec on purpose.

### REST endpoints the MCP tools will wrap (all under authenticateUser)

| Method/path | Handler |
|---|---|
| `GET /v1/user/me` | user details |
| `GET /v1/projects`, `POST /v1/projects` | list/create projects |
| `GET /v1/projects/:projectId/devices` | list devices |
| `GET /v1/projects/:projectId/devices/:deviceId` | get device |
| `GET /v1/projects/:projectId/devices/:deviceId/status` | connection status |
| `GET /v1/projects/:projectId/devices/:deviceId/metrics` | device metrics |
| `GET /v1/projects/:projectId/metrics` | project metrics |
| `GET /v1/projects/:projectId/devices/:deviceId/logs` | list logs (`?lines`, `?level`) |
| `GET/PUT /v1/projects/:projectId/env`, `DELETE /v1/projects/:projectId/env/:key` | env vars |
| `POST /v1/projects/:projectId/devices/:deviceId/command` | send command to a connected device |
| `GET /v1/projects/:projectId/devices/:deviceId/script` | current script meta |
| `PUT /v1/projects/:projectId/devices/:deviceId/script` | upload new script version |
| `GET /v1/projects/:projectId/devices/:deviceId/script/versions` | list versions |
| `POST .../script/versions/:versionId/deploy` | activate a version (rollback) |

Read the handler files under `apps/server/src/endpoints/` for exact
request/response schemas before writing each tool's inputSchema; the chanfana
`schema` property in each class is authoritative.

### Existing MCP artifacts being superseded

- `packages/mcp/src/index.ts` - the whole current implementation: stdio
  transport, 7 tools (`devicesdk_whoami`, `devicesdk_status`,
  `devicesdk_logs_tail`, `devicesdk_env_list`, `devicesdk_env_set`,
  `devicesdk_deploy`, `devicesdk_docs_search`) that shell out to the CLI via
  execa with `DEVICESDK_OUTPUT=json`. Its `devicesdk_docs_search` fetched
  `https://devicesdk.com/llms.txt` over the network and grepped it - the
  bundled server replaces that with a local FTS5 index (Step 3a); nothing is
  ported from it.
- `packages/cli/src/commands/init.ts:386` - scaffolds `.mcp.json` with
  `{ "command": "npx", "args": ["-y", "@devicesdk/mcp"] }`.
- `docs/public/mcp.md` - docs page, entirely written around the npm/stdio
  package.
- Monorepo already has `@modelcontextprotocol/sdk@1.29.0` in the lockfile
  (via packages/mcp); apps/server does not yet depend on it.

### Test harness

`apps/server/tests/harness.ts` exports `TestServer` (`TestServer.start()`,
`srv.register()`, `srv.get/post/put/delete(path, { token, body })`,
`srv.stop()`). E2E tests live in `apps/server/tests/e2e/*.test.ts` and run
with `bun test`. Model new tests after `tests/e2e/tokens.test.ts` and
`tests/e2e/cli-auth.test.ts` (the latter covers a browser-approval flow,
closest to OAuth). Check whether the harness exposes the raw Hono app or a
listening port and whether it supports arbitrary headers/redirect inspection;
extend the harness minimally if needed (it is in scope).

## Decisions already made (do not relitigate)

1. **Transport**: MCP Streamable HTTP at `POST /mcp`, **stateless**: no
   `Mcp-Session-Id`, a fresh `McpServer` instance built per request, no server
   to client push streams. `GET /mcp` and `DELETE /mcp` return 405 (allowed by
   the MCP spec for stateless servers). Stateless is what makes this safe in a
   single Bun process with zero cleanup concerns.
2. **Bridge library**: use `@hono/mcp` (`StreamableHTTPTransport`) to connect
   the MCP SDK server to Hono's fetch-based request/response. Before coding,
   check its README/npm for current API (`new StreamableHTTPTransport()`,
   `transport.handleRequest(c)`); if `@hono/mcp` turns out to be unavailable
   or incompatible with stateless per-request use, STOP and report.
3. **Tool implementation strategy**: tools do an **in-process loopback**
   against the existing REST API - `app.request(path, { method, headers: { Authorization: <incoming bearer> }, body }, c.env)` -
   instead of duplicating query logic. One source of truth; the REST handlers'
   validation, limits, and error shapes apply unchanged. The incoming
   Authorization header is available in the /mcp handler; forward it verbatim.
4. **Auth**: `/mcp` accepts any credential `authenticateUser` accepts via
   Bearer (API tokens, `dsdk_` CLI tokens). On 401 it MUST add
   `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`
   so MCP clients start OAuth discovery. OAuth is additive; power users can
   paste an API token as a static Bearer header instead.
5. **OAuth shape**: minimal OAuth 2.1 authorization server hosted by the same
   process. Authorization-code grant with **PKCE S256 required**, **dynamic
   client registration (RFC 7591) open** (rate-limited; this is a LAN
   self-host, DCR is what makes "just paste the URL" work), **no refresh
   tokens**, access token = managed API token (revocable in dashboard) that
   **expires 30 days after issuance** (`expires_at = now + 30d`; the token
   response carries `expires_in: 2592000`). When it expires the client simply
   re-runs the OAuth flow (fresh consent) - that is deliberate; do not add a
   refresh grant. `token_endpoint_auth_method: "none"` (public clients only).
   Do not implement scopes (single-user-grade server; the token grants what
   the user's account grants); return `scope` as an empty string if a client
   sends one. Manually created API tokens (never-expiring, made in the
   dashboard) remain a fully supported static-Bearer alternative on /mcp;
   docs present OAuth as the recommended path.
6. **npm package**: `@devicesdk/mcp` is **removed from the repo entirely**
   (the owner confirmed no users rely on it). Delete `packages/mcp/` and every
   reference to it. Unpublishing/deprecating the already-published npm
   versions is a human task (needs npm credentials) - list it, do not attempt
   it.
7. **New server env vars**: exactly one, `DOCS_INDEX_PATH` (Step 3a), with a
   working default for dev checkouts. The OAuth issuer URL is derived
   per-request from the request URL (same pattern as
   `endpoints/cli-auth/startAuth.ts:40-42`), so it works for
   `devicesdk.local`, LAN IPs, and reverse-proxied hosts without config.
8. **Docs search is local and version-pinned** (owner decision 2026-07-05):
   the docs pages are compiled into a SQLite FTS5 database during the build,
   shipped in the Docker image, and queried per-request with BM25. No call to
   devicesdk.com at runtime; a user on an older server version searches the
   docs for exactly that version.

## Commands you will need

| Purpose | Command (from repo root) | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck server | `pnpm check-types --filter @devicesdk/server` | exit 0 |
| Lint server | `pnpm lint --filter @devicesdk/server` | exit 0 |
| Server tests | `pnpm test --filter @devicesdk/server` | all pass |
| CLI tests | `pnpm test --filter @devicesdk/cli` | all pass |
| Build all | `pnpm build` | exit 0 |
| Changeset | `pnpm changeset` | interactive; commit the generated file |
| Run server locally | `cd apps/server && PORT=18080 DATA_DIR=/tmp/dsdk-mcp-test ENV=local bun run src/server.ts` | "listening on http://localhost:18080" |

Lint before every commit (repo rule). Bun-specific APIs stay inside
`apps/server` (repo rule) - nothing Bun-specific goes into `packages/cli`.

## Scope

**In scope** (the only files you should create/modify):

- `apps/server/package.json` (add `@modelcontextprotocol/sdk`, `@hono/mcp`;
  extend the `build` script)
- `apps/server/scripts/build-docs-index.ts` (create)
- `apps/server/src/config.ts` (add `docsIndexPath`)
- `apps/server/src/mcp/docsSearch.ts` (create)
- `Dockerfile` (build + copy the docs index, `DOCS_INDEX_PATH` env)
- `.gitignore` (only if `apps/server/dist/` is not already ignored)
- `apps/server/migrations/0027_add_oauth_tables.sql` (create; also adds
  `tokens.expires_at`)
- `apps/server/src/types.d.ts` (add `tableOauthClients`, `tableOauthAuthCodes`;
  add `expires_at` to `tableTokens`)
- `apps/server/src/mcp/` (create: `mcpServer.ts`, `tools.ts`, `route.ts`)
- `apps/server/src/oauth/` (create: `metadata.ts`, `register.ts`,
  `authorizePage.ts`, `token.ts`, `store.ts`)
- `apps/server/src/index.ts` (mount /mcp, /oauth/*, /.well-known/*)
- `apps/server/src/foundation/auth.ts` (add the /mcp 401 `WWW-Authenticate`
  wrapper - see Step 5 - and the API-token expiry check - see Step 1)
- `apps/server/src/janitor.ts` (expired OAuth code + expired token cleanup)
- `apps/server/tests/harness.ts` (minimal extensions if needed)
- `apps/server/tests/e2e/mcp.test.ts`, `apps/server/tests/e2e/oauth.test.ts` (create)
- `packages/cli/src/commands/init.ts` (scaffold HTTP `.mcp.json`)
- `packages/cli` tests for init scaffold (wherever init is currently tested;
  find with `grep -rn "mcp.json" packages/cli/tests packages/cli/src --include='*.test.ts'`)
- `packages/mcp/` (delete the entire directory) plus every cross-reference to
  it found by `grep -rn "@devicesdk/mcp\|packages/mcp" --include='*.{ts,json,md,yml,yaml}' .`
  outside node_modules (expect: `packages/cli/src/commands/init.ts`,
  `docs/public/mcp.md`, possibly `README.md`, `.github/workflows/release.yml`,
  `pnpm-lock.yaml` via `pnpm install`)
- `docs/public/mcp.md` (rewrite)
- `.changeset/*.md` (create)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):

- `apps/dashboard/**` - the Tokens page already renders managed tokens; no UI
  change needed in this plan.
- `apps/server/src/endpoints/**` REST handlers and their schemas - tools wrap
  them via loopback; do not modify response shapes.
- `apps/server/src/foundation/mdns/**` - already advertises the right host/port.
- npm itself - do not run `npm unpublish`/`npm deprecate`; the published
  versions are handled by a human (Step 12 lists the command).
- `apps/website/**` build tooling (the docs page content under `docs/public/`
  is enough; the site consumes it).
- `.github/workflows/**`.

## Git workflow

- Worktree + branch (repo rule - never work in the main checkout):
  `git worktree add .worktrees/bundled-mcp-server -b bundled-mcp-server`
- Conventional commits, e.g. `feat(server): stateless MCP endpoint at /mcp`,
  `feat(server): oauth 2.1 authorization for MCP clients`,
  `feat(cli): scaffold http .mcp.json pointing at the server`,
  `docs(mcp): rewrite for the bundled /mcp endpoint`.
- Create the changeset early (`pnpm changeset`): `@devicesdk/server` **minor**,
  `@devicesdk/cli` **minor**, `@devicesdk/website` **patch** (docs). No
  changeset for `@devicesdk/mcp` - the package is deleted and changesets
  cannot reference a removed package. Never `major` (repo rule).
- Finish by opening a PR into `main` with `gh pr create --base main` **only if**
  `git remote get-url origin` is `github.com/device-sdk/devicesdk`; otherwise
  report and ask.

## Steps

### Step 1: Migration + table types

Create `apps/server/migrations/0027_add_oauth_tables.sql`:

```sql
-- OAuth 2.1 dynamic client registrations (RFC 7591) for MCP clients.
CREATE TABLE oauth_clients (
    id TEXT PRIMARY KEY,               -- client_id (uuid)
    client_name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,       -- JSON array of exact-match URIs
    created_at INTEGER NOT NULL
);

-- Short-lived authorization codes (10 min), single use.
CREATE TABLE oauth_auth_codes (
    id TEXT PRIMARY KEY,               -- uuid
    code_hash TEXT NOT NULL UNIQUE,    -- HMAC of the code, same scheme as tokens
    client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,      -- PKCE S256 challenge
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX idx_oauth_auth_codes_expires ON oauth_auth_codes(expires_at);

-- API tokens gain an optional expiry. NULL = never expires (all existing
-- tokens and dashboard-created tokens). OAuth-minted MCP tokens set it.
ALTER TABLE tokens ADD COLUMN expires_at INTEGER;
```

Match the SQL style of `0008_add_cli_auth_tables.sql`. Add matching
`tableOauthClients` / `tableOauthAuthCodes` interfaces to
`apps/server/src/types.d.ts` following the existing `tableTokens` style, and
add `expires_at: number | null` to `tableTokens`.

Then enforce expiry in `apps/server/src/foundation/auth.ts`: in the API-token
lookup (the `fetchOne` against `tokens t` at lines 226-240), extend the WHERE
to `(t.expires_at IS NULL OR t.expires_at > ?2)` with `Date.now()` as the
second param. Session and `dsdk_` lookups already check expiry; do not touch
them. In `src/janitor.ts`, delete rows from `tokens` where
`expires_at IS NOT NULL AND expires_at < now`, following the existing
expired-session pattern.

**Verify**: `pnpm check-types --filter @devicesdk/server` → exit 0. Boot the
server against a fresh `DATA_DIR` (run command from the table above) → log line
shows 1 migration applied; `sqlite3 /tmp/dsdk-mcp-test/devicesdk.sqlite ".tables"`
lists `oauth_clients` and `oauth_auth_codes`.

### Step 2: Add dependencies

In `apps/server/package.json` add `@modelcontextprotocol/sdk` (align with the
lockfile's `1.29.0` or newer) and `@hono/mcp` (latest; check
`npm view @hono/mcp version`). Run `pnpm install`.

**Verify**: `pnpm install` exit 0;
`node -e "console.log(require('./apps/server/node_modules/@hono/mcp/package.json').version)"`
prints a version.

### Step 3: MCP tool definitions (`apps/server/src/mcp/tools.ts`)

Build a `registerTools(server: McpServer, deps: { authHeader: string; env: Env })`
function. Each tool handler performs the loopback described in "Decisions" 3;
import `app` lazily or receive it via deps to avoid an import cycle with
`index.ts` (index imports the mcp route; the mcp route must not import `app`
at module top level - pass the fetch function in from `index.ts` instead if
needed; resolving this cleanly is part of the step).

Tools (all named with the `devicesdk_` prefix; write one-paragraph
descriptions aimed at an agent, and precise Zod/JSON inputSchemas copied from
the REST schemas):

Read-only (`annotations: { readOnlyHint: true }`):
- `devicesdk_whoami` → `GET /v1/user/me`
- `devicesdk_list_projects` → `GET /v1/projects`
- `devicesdk_list_devices` (projectId) → `GET /v1/projects/:id/devices`
- `devicesdk_device_status` (projectId, deviceId) → `.../status`
- `devicesdk_device_logs` (projectId, deviceId, lines?, level?) → `.../logs`
- `devicesdk_device_metrics` (projectId, deviceId, window?) → `.../metrics`
- `devicesdk_project_metrics` (projectId, window?) → `/v1/projects/:id/metrics`
- `devicesdk_env_list` (projectId) → `GET .../env`
- `devicesdk_list_script_versions` (projectId, deviceId) → `.../script/versions`
- `devicesdk_docs_search` (query) - **local full-text search** over a SQLite
  FTS5 index of the docs built at build time and shipped in the image (see
  Step 3a). No network call; results are version-pinned to the docs the
  server shipped with. Returns `{ path, url, title, snippet }` rows ranked by
  BM25. If the index file is missing (dev checkout without a build), return
  `success: false` with a hint to run the server build - never throw.

Mutating:
- `devicesdk_env_set` (projectId, vars: Record<string,string>) → `PUT .../env`
- `devicesdk_env_delete` (projectId, key) → `DELETE .../env/:key`
  (`destructiveHint: true`)
- `devicesdk_send_command` (projectId, deviceId, command payload per
  `sendCommand.ts` schema) → `POST .../command`
- `devicesdk_upload_script` (projectId, deviceId, code, entrypoint?, message?)
  → `PUT .../script`. Description must say: "code must be already-bundled
  JavaScript; build TypeScript projects with `devicesdk build` or the CLI
  deploy flow".
- `devicesdk_deploy_version` (projectId, deviceId, versionId) →
  `POST .../script/versions/:versionId/deploy` (rollback/promote).

Tool results: return the REST JSON body as pretty-printed text content and set
`isError: !body.success` (same convention as `packages/mcp/src/index.ts:60-70`).

There is intentionally **no** `devicesdk_deploy` build tool: the server cannot
build the user's local TypeScript project. The docs (Step 9) explain that
split.

**Verify**: `pnpm check-types --filter @devicesdk/server` → exit 0.

### Step 3a: Build-time docs search index (SQLite FTS5, shipped in the image)

Rationale (owner decision 2026-07-05): docs search must work offline and
return results matching the **installed server version**, not whatever the
live website currently says. So the docs are compiled into a SQLite FTS5
database at build time and queried locally with BM25 ranking (FTS5's
`ORDER BY rank` is BM25 out of the box; Bun's bundled SQLite has FTS5
enabled).

1. **Sanity-check FTS5 first**:
   `bun -e 'const {Database}=require("bun:sqlite");new Database(":memory:").exec("CREATE VIRTUAL TABLE t USING fts5(a)");console.log("fts5 ok")'`
   → prints `fts5 ok`. If it errors, STOP.
2. **Indexer script** `apps/server/scripts/build-docs-index.ts` (Bun,
   `bun:sqlite` allowed here - it is inside apps/server). Behavior:
   - Input dir: CLI arg or default `../../docs/public` relative to the script.
     Output: CLI arg or default `apps/server/dist/docs-index.sqlite`
     (delete any existing file first so the index is always fresh).
   - Walk `**/*.md`. For each file: parse frontmatter (`title`,
     `description` - look at how `apps/website/scripts/build-content.ts`
     parses these and match its conventions), strip the frontmatter block,
     strip markdown syntax to plain text (a simple regex pass is fine:
     code-fence markers, links to their text, heading hashes, emphasis).
     Derive the docs path from the file path: `docs/public/mcp.md` →
     `/docs/mcp/`, `docs/public/cli/init.md` → `/docs/cli/init/`,
     `_index.md` → its directory's path (check build-content.ts for the
     exact mapping the website uses and mirror it).
   - Schema:
     `CREATE VIRTUAL TABLE docs_fts USING fts5(path UNINDEXED, title, description, content, tokenize='porter unicode61')`,
     one row per page. Also a `meta` table with `built_at` and the doc count.
   - Print a summary line (`indexed N pages -> <path>`); exit non-zero if 0
     pages were indexed.
   - Wire into the server build: `apps/server/package.json` `"build"` becomes
     `"pnpm run openapi && bun run scripts/build-docs-index.ts"`. Add
     `apps/server/dist/` to `.gitignore` if not already ignored (check).
3. **Config**: add `docsIndexPath` to `apps/server/src/config.ts` following
   the `migrationsDir` pattern exactly (line 90-93): env override
   `DOCS_INDEX_PATH`, default
   `new URL("../dist/docs-index.sqlite", import.meta.url).pathname`.
4. **Search helper** `apps/server/src/mcp/docsSearch.ts`: lazily open the DB
   read-only (`new Database(path, { readonly: true })`) on first query, cache
   the handle; if the file does not exist return the missing-index result.
   Sanitize the user query before MATCH (FTS5 has its own query syntax that
   throws on stray quotes/operators): split on non-alphanumerics, drop empty
   tokens, wrap each in double quotes, join with spaces (implicit AND); if
   that yields no rows, retry joined with ` OR `. Query:
   `SELECT path, title, snippet(docs_fts, 3, '[', ']', ' … ', 16) AS snippet FROM docs_fts WHERE docs_fts MATCH ?1 ORDER BY rank LIMIT 10`.
   Return `url: "https://devicesdk.com" + path` alongside each row (the live
   site may be newer than the local snippet; the snippet is what the
   installed version documents - say so in the tool description).
5. **Dockerfile**: in the `serverbuild` stage, after the `bun build` line, run
   `cd /repo/apps/server && bun run scripts/build-docs-index.ts ../../docs/public /out/docs-index.sqlite`
   (docs are in the build context; stage 1 `COPY . .` brings them in). In the
   runtime stage: `COPY --from=serverbuild /out/docs-index.sqlite /app/docs-index.sqlite`
   and add `DOCS_INDEX_PATH=/app/docs-index.sqlite` to the `ENV` block.

**Verify**:
`cd apps/server && bun run scripts/build-docs-index.ts` → prints
`indexed N pages` with N > 20;
`bun -e 'const {Database}=require("bun:sqlite");const d=new Database("dist/docs-index.sqlite",{readonly:true});console.log(d.query("SELECT path,title FROM docs_fts WHERE docs_fts MATCH ?1 ORDER BY rank LIMIT 3").all("\"mdns\""))'`
→ rows including the mDNS-related docs page.

### Step 4: Stateless /mcp route (`apps/server/src/mcp/route.ts` + `mcpServer.ts`)

- `mcpServer.ts`: `buildMcpServer(deps)` constructs a fresh
  `McpServer({ name: "devicesdk", version: <server version> })` with
  `registerTools`. Read the version from the server package.json the same way
  other server code does (grep for `version` usage; if none, hardcoding via an
  import of `../../package.json` with `type: json` is acceptable in Bun).
- `route.ts`: a Hono handler for `POST /mcp`: build server, create
  `StreamableHTTPTransport` (stateless config), `await server.connect(transport)`,
  `return transport.handleRequest(c)`. `GET /mcp` and `DELETE /mcp` return 405
  with `Allow: POST`.

**Verify**: with the server running locally and `TOKEN` an API token created
via the dashboard/REST (register a user first on a fresh DATA_DIR:
`curl -s -X POST localhost:18080/v1/auth/register -H 'content-type: application/json' -d '{"email":"t@t.co","password":"password1234","name":"t"}'`,
then use the session cookie to `POST /v1/tokens`):

```bash
curl -s -X POST http://localhost:18080/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

→ a JSON-RPC result listing all 15 tools. Then a `tools/call` of
`devicesdk_list_projects` → `success: true` with an empty projects array.

### Step 5: 401 + WWW-Authenticate on /mcp

Mount `/mcp` behind `authenticateUser` in `index.ts`. The middleware's 401
responses currently have no `WWW-Authenticate` header. Smallest change: in
`index.ts`, wrap it -

```ts
const mcpAuth = async (c: AppContext, next: Next) => {
  const res = await authenticateUser(c, next);
  if (res instanceof Response && res.status === 401) {
    const origin = new URL(c.req.url).origin;
    const headers = new Headers(res.headers);
    headers.set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    );
    return new Response(res.body, { status: 401, headers });
  }
  return res;
};
```

Place the wrapper next to `cliAuthUser`'s pattern (a wrapper already exists at
`foundation/auth.ts:111`, so putting `mcpAuth` in `foundation/auth.ts` is the
consistent location). Session-cookie auth also passing on /mcp is harmless
(same-origin browser only); do not try to exclude it.

**Verify**: `curl -si -X POST http://localhost:18080/mcp -H 'content-type: application/json' -d '{}'`
→ `401` with the `WWW-Authenticate` header exactly as above.

### Step 6: OAuth discovery metadata (`apps/server/src/oauth/metadata.ts`)

Two unauthenticated GET endpoints, both deriving `origin` from the request URL:

- `/.well-known/oauth-protected-resource` (RFC 9728):
  `{ "resource": "<origin>/mcp", "authorization_servers": ["<origin>"], "bearer_methods_supported": ["header"] }`
  Also serve the same document at
  `/.well-known/oauth-protected-resource/mcp` (clients using the
  path-suffixed form per RFC 9728 section 3).
- `/.well-known/oauth-authorization-server` (RFC 8414):

  ```json
  {
    "issuer": "<origin>",
    "authorization_endpoint": "<origin>/oauth/authorize",
    "token_endpoint": "<origin>/oauth/token",
    "registration_endpoint": "<origin>/oauth/register",
    "response_types_supported": ["code"],
    "grant_types_supported": ["authorization_code"],
    "code_challenge_methods_supported": ["S256"],
    "token_endpoint_auth_methods_supported": ["none"]
  }
  ```

**Verify**: `curl -s localhost:18080/.well-known/oauth-authorization-server | jq .issuer`
→ `"http://localhost:18080"`.

### Step 7: Dynamic client registration (`apps/server/src/oauth/register.ts`)

`POST /oauth/register`, unauthenticated, rate-limited
(`rateLimitMiddleware(10, 60_000)`). Validate body with Zod:
`client_name` (string, max 100, default "MCP client"), `redirect_uris`
(non-empty array of strings; each must parse as a URL with scheme `https`,
`http` for loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) **or any
non-loopback http host** - this is a LAN product where the agent host itself
may be non-TLS; document that choice in a code comment - or a custom scheme
like `cursor://` for native clients). Insert into `oauth_clients`; respond 201
with RFC 7591 shape:
`{ "client_id": "<uuid>", "client_name": ..., "redirect_uris": [...], "token_endpoint_auth_method": "none", "grant_types": ["authorization_code"], "response_types": ["code"] }`.

**Verify**: curl a registration → 201 with a `client_id`; a second curl with
`redirect_uris: ["notaurl"]` → 400 with RFC error shape
`{ "error": "invalid_client_metadata", ... }`.

### Step 8: Authorize consent page + token endpoint

`apps/server/src/oauth/authorizePage.ts` - model closely on
`endpoints/cli-auth/approvalPage.ts` (same `renderPage` card look, same CSRF
cookie mechanics with cookie name `oauth_csrf` and `path: "/oauth/authorize"`,
same escapeHtml):

- `GET /oauth/authorize` behind `cliAuthUser` (redirects unauthenticated
  browsers to the dashboard login and back - this is the "oauth screen pops
  up" moment). Validate query params: `response_type=code`, `client_id`
  (exists in `oauth_clients`), `redirect_uri` (exact string match against the
  client's registered list), `code_challenge` (43-128 chars),
  `code_challenge_method=S256`, optional `state`. On invalid client/redirect
  render an error page and do NOT redirect (per OAuth security BCP); for other
  errors redirect back with `?error=`. Render a consent card: "**<client_name>**
  wants to access your DeviceSDK server as **<user email>**. This will create
  an API token you can revoke anytime in the dashboard's Tokens page."
  Approve / Deny buttons in a POST form carrying all params + CSRF token.
- `POST /oauth/authorize` (same middleware): CSRF check, re-validate
  everything, then on approve: generate a code
  (`crypto.randomUUID().replaceAll("-", "")`), store its `hashToken()` hash in
  `oauth_auth_codes` with `expires_at = now + 10 min`, redirect 302 to
  `redirect_uri?code=<raw>&state=<state>`. On deny redirect with
  `?error=access_denied&state=<state>`.
- `apps/server/src/oauth/token.ts` - `POST /oauth/token`, unauthenticated,
  rate-limited (`rateLimitMiddleware(30, 60_000)`), accepts
  `application/x-www-form-urlencoded` (required by spec; also accept JSON).
  Validate `grant_type=authorization_code`, `code`, `redirect_uri`,
  `client_id`, `code_verifier`. Look up the code by hash; reject if expired or
  missing (`invalid_grant`). Verify PKCE:
  base64url(SHA-256(code_verifier)) === stored `code_challenge`. Verify
  `client_id` and `redirect_uri` match the stored row. **Delete the code row
  before minting** (single use). Mint the access token exactly like
  `createApiToken.ts:74-92` but with `managed: 1` and
  `description: "MCP: <client_name>"` (truncate to the 100-char description
  limit) and `expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000` (30 days),
  bypassing the unmanaged-token count limit (managed tokens are excluded from
  it already). Respond
  `{ "access_token": "<raw>", "token_type": "Bearer", "expires_in": 2592000 }`
  (no refresh token; after expiry the client re-runs the OAuth flow). Error
  responses use RFC 6749
  shape with correct `error` codes and status 400 (`invalid_grant`,
  `invalid_request`) / 401 (`invalid_client`).
- `apps/server/src/oauth/store.ts` - the small qb helpers shared by the above
  (fetch client, insert/consume code). Keep files under 700 LOC total per file
  (repo rule); split further if needed.
- Janitor: in `src/janitor.ts`, add a delete of `oauth_auth_codes` where
  `expires_at < now`, following the existing expired-CLI-codes pattern
  (the expired-`tokens` cleanup was added in Step 1).
- Mount everything in `index.ts` **before** the `/v1/*` auth middleware
  (they are not /v1 routes so order vs. that middleware is moot, but they must
  be before the `app.get("*", serveSpa)` catch-all; note `serveSpa` only
  handles GET, and your GET routes are registered earlier, so Hono matching
  order keeps them reachable - register them in section 1 of index.ts next to
  the /cli/auth routes anyway for readability).

**Verify** (scriptable end-to-end, no browser):

```bash
# 1. register client
CID=$(curl -s -X POST localhost:18080/oauth/register -H 'content-type: application/json' \
  -d '{"client_name":"curl test","redirect_uris":["http://localhost:9999/cb"]}' | jq -r .client_id)
# 2. login for a session cookie
curl -s -c /tmp/jar -X POST localhost:18080/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"t@t.co","password":"password1234"}' > /dev/null
# 3. PKCE pair
VERIFIER=$(head -c 32 /dev/urandom | basetenc --base64url | tr -d '=' 2>/dev/null || openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
# 4. GET consent page (grab csrf from set-cookie), then POST approve, capture 302 Location
# 5. exchange code
curl -s -X POST localhost:18080/oauth/token -d "grant_type=authorization_code&code=$CODE&redirect_uri=http://localhost:9999/cb&client_id=$CID&code_verifier=$VERIFIER"
```

→ step 5 returns
`{"access_token":"...","token_type":"Bearer","expires_in":2592000}`, and that
token authenticates `POST /mcp` (repeat Step 4's curl). Reusing the same code
→ `{"error":"invalid_grant"}`. A wrong verifier → `invalid_grant`. The token
appears in `GET /v1/tokens` with `managed: true` and description
`MCP: curl test`. A plain dashboard-created API token (no expiry) also
authenticates `POST /mcp` - both paths must work. (Automate all of this properly in the e2e tests, Step 10;
the curl walk-through is for your own smoke check.)

### Step 9: End-to-end client smoke check (manual, best effort)

If `claude` CLI or another MCP-capable client is available in the execution
environment, add the local server
(`claude mcp add --transport http devicesdk-local http://localhost:18080/mcp`)
and confirm the OAuth flow triggers. If no client is available, skip; the e2e
tests are the gate. Do not install new global software for this.

### Step 10: Tests

`apps/server/tests/e2e/mcp.test.ts` (model after `tests/e2e/tokens.test.ts`):
- `POST /mcp` without token → 401 + `WWW-Authenticate` header containing
  `resource_metadata`.
- `tools/list` with a valid API token → 15 tools, names asserted.
- `tools/call devicesdk_list_projects` → success with the caller's projects
  (create one via REST first, assert it appears).
- `tools/call devicesdk_env_set` then `devicesdk_env_list` → key present.
- `tools/call` with a token from user A cannot see user B's project (create
  two users; assert the project list is scoped).
- `GET /mcp` → 405.
- `tools/call devicesdk_docs_search` with query "mdns" → success with at
  least one result whose `url` starts with `https://devicesdk.com/docs/`
  (build the index first in the test setup by running
  `scripts/build-docs-index.ts` against the repo's `docs/public` into a temp
  path and pointing `DOCS_INDEX_PATH` at it via the harness env, or skip with
  a comment if the harness cannot inject env - then cover it in the unit
  test only).
- Note: MCP responses may be `text/event-stream`-framed even for single
  responses depending on the transport; parse accordingly (inspect the actual
  content-type in the first test and write a small helper).

`apps/server/tests/unit/docs-index.test.ts` (model after
`tests/unit/db-layer.test.ts`): run the indexer against a fixture dir of 3
small .md files (created in the test, in a temp dir) → assert page count,
path mapping (`sub/page.md` → `/docs/sub/page/`, `_index.md` → `/docs/`),
BM25 ordering (a term appearing in one fixture ranks that page first),
snippet content, and that a query full of FTS5 operators
(`"AND ( * NEAR"`) returns a result set or empty - never throws.

`apps/server/tests/e2e/oauth.test.ts` (model after `tests/e2e/cli-auth.test.ts`):
- metadata endpoints return the documented JSON (issuer matches request origin).
- DCR happy path + `invalid_client_metadata` on bad redirect URI.
- full code + PKCE exchange (drive GET consent → parse CSRF → POST approve →
  parse redirect Location → token exchange) → access token works on /mcp.
- code single-use, code expiry (insert an expired row directly via the
  harness DB handle if exposed, otherwise skip expiry and note it), wrong
  verifier, mismatched redirect_uri → `invalid_grant`.
- deny path → redirect with `error=access_denied`.
- minted token listed in `/v1/tokens` with `managed: true`; deleting it via
  `DELETE /v1/tokens/:id` makes /mcp return 401.
- token expiry: after minting, set the token row's `expires_at` to the past
  directly via the harness DB handle (or SQL) → /mcp and `/v1/projects`
  return 401; a NULL-expiry token created via `POST /v1/tokens` keeps
  working (regression guard for the auth.ts WHERE change).

**Verify**: `pnpm test --filter @devicesdk/server` → all pass, including the
new files.

### Step 11: CLI `init` scaffold

In `packages/cli/src/commands/init.ts` (`.mcp.json` generation around line
386), replace the npx/stdio block with the HTTP form:

```json
{
  "mcpServers": {
    "devicesdk": {
      "type": "http",
      "url": "<host>/mcp"
    }
  }
}
```

where `<host>` is the CLI's resolved host if a host is known at init time
(look at how init/other commands resolve the host - credentials store or
`DEVICESDK_API_URL`; grep for the host-resolution helper), falling back to
`http://devicesdk.local:8080`. Update the nearby comment and any generated
AGENTS.md text in the same file that mentions `@devicesdk/mcp`. Update the CLI
init tests that assert the `.mcp.json` content.

**Verify**: `pnpm test --filter @devicesdk/cli` → pass;
`grep -n "@devicesdk/mcp" packages/cli/src/commands/init.ts` → no matches.

### Step 12: Remove the npm package from the repo

The owner confirmed no users rely on `@devicesdk/mcp`; remove it outright.

- `git rm -r packages/mcp`.
- Run `pnpm install` to update `pnpm-lock.yaml` (the workspace globs
  `packages/*`, so deleting the directory is enough; no
  `pnpm-workspace.yaml` edit needed - verify by inspecting it).
- Purge remaining references (verified at planning time; re-grep to confirm):
  - `AGENTS.md` lines 79, 233, 256 - remove the `packages/mcp` architecture
    entry and drop `@devicesdk/mcp` from both npm-published package lists.
    `CLAUDE.md` is a symlink to `AGENTS.md`; do not edit it separately.
  - `README.md:102` and `CONTRIBUTING.md:38` - remove the table rows.
  - `docs/public/cli/init.md` - update the two mentions to describe the new
    HTTP `.mcp.json` scaffold.
  - `packages/cli/src/commands/init.ts` - already handled in Step 11.
  - `docs/public/mcp.md` - handled in Step 13.
  - Historical `CHANGELOG.md` mentions across packages stay untouched.
- Human tasks to list in your final report (need npm credentials; do NOT
  attempt):
  `npm deprecate @devicesdk/mcp "The DeviceSDK server now serves MCP built-in at /mcp - https://devicesdk.com/docs/mcp/"`
  (or `npm unpublish @devicesdk/mcp --force` within npm's 72h/unpublish
  policy window if preferred).

**Verify**: `grep -rn "@devicesdk/mcp\|packages/mcp" --include='*.ts' --include='*.json' --include='*.md' . | grep -v node_modules | grep -v CHANGELOG | grep -v plans/` →
no matches outside `docs/public/changelog.md` history entries; `pnpm install`
and `pnpm build` exit 0.

### Step 13: Rewrite `docs/public/mcp.md`

Keep the frontmatter keys (`title`, `description`, `weight: 28`,
`social_image`) - update `title` to something like
"MCP server (built into DeviceSDK)". New structure:

1. What it is: the server exposes MCP at `/mcp` (Streamable HTTP, stateless);
   nothing to install.
2. Quickstart per host: `.mcp.json` HTTP block (same as Step 11's output);
   `claude mcp add --transport http devicesdk http://devicesdk.local:8080/mcp`;
   Cursor/VS Code/Windsurf equivalents (URL-based config). Note that
   `devicesdk init` scaffolds this automatically.
3. Authentication (recommended: OAuth): first connection triggers OAuth -
   browser opens, log into the dashboard if needed, click Approve; this mints
   an API token visible and revocable in the dashboard Tokens page, valid for
   30 days (the client re-prompts for consent after that). Alternative: create
   an API token in the dashboard (never expires) and paste it as a Bearer
   header (show the `.mcp.json` `headers` form) - useful for headless setups
   and hosts without OAuth support. Troubleshooting bullet: some MCP hosts
   refuse plain-http OAuth for non-localhost hosts; if the OAuth popup never
   appears, use the Bearer-header method or put the server behind TLS.
4. Tools table: the 15 tools from Step 3 with one-line descriptions. Call out
   explicitly that **building/deploying a local TypeScript project stays in
   the CLI** (`devicesdk deploy` or the agent runs the CLI); `devicesdk_upload_script`
   takes pre-bundled JS only. Note that `devicesdk_docs_search` searches an
   offline copy of these docs matching the installed server version (no
   internet needed; results can lag the live site until the server is
   updated).
5. mDNS note: `devicesdk.local` works when client and server share a LAN and
   the client OS resolves mDNS; otherwise use the server's IP.
6. Keep the "See also" links that still apply; drop every reference to the
   removed `@devicesdk/mcp` npm package (no legacy section - the package is
   gone and nobody relied on it).

**Verify**: `pnpm lint --filter @devicesdk/website` and
`pnpm check-types --filter @devicesdk/website` → exit 0 (the site consumes
docs at build; also run `pnpm build --filter @devicesdk/website` if quick).

### Step 14: Changesets, lint, full build

Create the changeset(s) covering `@devicesdk/server` (minor: "Built-in
stateless MCP server at /mcp with OAuth 2.1 client authorization; API tokens
gain optional expiry"), `@devicesdk/cli` (minor: ".mcp.json scaffold now
points at the server's /mcp endpoint; @devicesdk/mcp removed"), and
`@devicesdk/website` (patch: MCP docs rewrite). Run the full gates.

**Verify**: `pnpm lint` exit 0; `pnpm build` exit 0;
`pnpm test --filter @devicesdk/server` and `--filter @devicesdk/cli` pass;
`ls .changeset/*.md` shows your file(s).

## Test plan

Covered in Steps 10-11; summary of the regression surface a reviewer cares
about: unauthenticated /mcp is a hard 401 (no tool ever executes), OAuth codes
are single-use + PKCE-bound + expiring, redirect URIs are exact-match, minted
tokens are managed + revocable and revocation locks out /mcp, tool calls are
scoped to the authenticated user, and the existing REST/e2e suites still pass
untouched (proof the loopback approach changed no handler).

## Done criteria

ALL must hold:

- [ ] `pnpm lint`, `pnpm build`, `pnpm check-types --filter @devicesdk/server` exit 0
- [ ] `pnpm test --filter @devicesdk/server` passes incl. new `mcp.test.ts` + `oauth.test.ts`
- [ ] `pnpm test --filter @devicesdk/cli` passes with the new `.mcp.json` assertion
- [ ] Manual curl flow from Step 8 works end to end on a fresh DATA_DIR
- [ ] `cd apps/server && bun run scripts/build-docs-index.ts` indexes > 20
      pages and the FTS5 smoke query from Step 3a returns rows; `Dockerfile`
      builds and copies the index and sets `DOCS_INDEX_PATH`
- [ ] `curl -si -X POST localhost:<port>/mcp -d '{}'` → 401 with `WWW-Authenticate` containing `resource_metadata`
- [ ] `packages/mcp/` no longer exists; the reference grep in Step 12 is clean
- [ ] Changesets exist for server, cli, website; no `major` bump
- [ ] An expired-`expires_at` token is rejected and a NULL-`expires_at` token
      accepted (covered by the new oauth.test.ts cases)
- [ ] No files outside the in-scope list modified (`git status` in the worktree)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `@hono/mcp` does not exist on npm, or its `StreamableHTTPTransport` cannot
  be used per-request/stateless with `@modelcontextprotocol/sdk` >= 1.29.
  (Fallback direction to propose, not implement: hand-rolled JSON-RPC handling
  of `initialize`/`tools/list`/`tools/call` on POST /mcp - viable but a
  design change.)
- The in-process loopback (`app.request(..., c.env)`) does not execute the
  authenticated REST handlers (e.g. chanfana/Hono needs something extra from
  the real `Bun.serve` request lifecycle). Do not start duplicating query
  logic into tools.
- `authenticateUser`'s structure at `foundation/auth.ts:123-264` no longer
  matches the excerpt (drift).
- The MCP client smoke test (Step 9, if run) rejects the OAuth metadata in a
  way that implies a spec-shape mistake you cannot fix within the documented
  endpoints.
- Migration numbering conflicts (a `0027_*.sql` already exists).
- Anything requires touching `apps/dashboard` or REST handler schemas.
- The FTS5 sanity check in Step 3a fails (Bun's SQLite lacking FTS5 would
  invalidate the whole docs-search design).
- The docs-path-to-URL mapping in `apps/website/scripts/build-content.ts`
  is materially different from the `dir/page.md -> /docs/dir/page/` shape
  assumed in Step 3a (e.g. slugs come from frontmatter, not filenames) - the
  index would ship wrong URLs.

## Maintenance notes

- **Plan 002 interaction**: plan 002 was already revised (2026-07-05) to run
  AFTER this plan - its Phase 1 (publish `@devicesdk/mcp` to the official MCP
  registry) is marked REJECTED because this plan deletes that package, and
  its remaining phases describe the `/mcp` endpoint this plan ships. No
  action needed here beyond mentioning the ordering in the PR description.
- **Security posture**: DCR is open (rate-limited); OAuth access tokens
  expire after 30 days with no refresh grant (re-consent instead), while
  manually created API tokens never expire. Deliberate for a LAN self-host
  UX; if the server is ever exposed to the public internet, revisit: shorter
  expiry + refresh grants, and consider `ALLOW_REGISTRATION`-style gating on
  `/oauth/register`. A reviewer should scrutinize the PKCE verification, the
  exact-match redirect URI check, and the `expires_at` WHERE-clause change in
  `authenticateUser` (a mistake there locks out every existing API token).
- **Docs index coupling**: the FTS5 index is rebuilt on every server build
  from `docs/public/**/*.md`, so docs edits ship automatically with the next
  image. Two things can silently break it: (a) the website changing its
  path-to-URL mapping (the indexer mirrors `build-content.ts` - keep them in
  sync, ideally extract a shared mapping note in both files' comments), and
  (b) docs restructures that make > 0 pages fail frontmatter parsing - the
  indexer exits non-zero on 0 pages but tolerates partial loss; consider a
  minimum-count guard if the docs tree grows.
- **Tool growth**: new REST endpoints do not automatically appear as tools;
  adding a tool = one entry in `apps/server/src/mcp/tools.ts`. Keep tool names
  stable once shipped (agents' configs and memories reference them).
- **Deferred**: MCP resources/prompts (tools only for now); scoped tokens
  (per-project OAuth scopes); serving `expires_in` + refresh tokens; a
  dashboard UI affordance that badges MCP-minted tokens beyond the existing
  `managed` flag; converging `devicesdk dev`/build flows onto server-side
  builds (roadmap item, would unlock a true deploy tool).
