# Plan 002: Make DeviceSDK discoverable and instantly usable by AI coding agents

> **Revised 2026-07-05 (commit `321ef7e`)**: plan 003 bundles a stateless MCP
> server into `apps/server` at `/mcp` and **deletes the `packages/mcp` npm
> package**. This plan now executes AFTER 003. Phase 1 (publish
> `@devicesdk/mcp` to the official MCP registry) is REJECTED - the package it
> would publish no longer exists, and the registry cannot list a self-hosted
> remote URL. Phases 2-5 are unchanged in intent; agent-facing copy now points
> at the built-in `/mcp` endpoint instead of `npx -y @devicesdk/mcp`.

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 321ef7e..HEAD -- apps/website/generate-agent-skills.js apps/website/src/composables/useSiteHead.ts apps/website/scripts/build-content.ts apps/website/static/.well-known README.md`
> Expected drift: plan 003 already changed README.md (it removes the
> `packages/mcp` table row) and `docs/public/mcp.md`; that drift is fine.
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (4 independently-shippable phases; each phase is S or M.
  Phase 1 was dropped - see revision note above)
- **Risk**: LOW (all additive; no runtime behavior changes to server/CLI/firmware)
- **Depends on**: plans/003-bundled-mcp-server.md (execute 003 first; this
  plan's agent-facing copy describes the `/mcp` endpoint 003 ships, and 003
  deletes the package Phase 1 would have published)
- **Category**: dx / docs / direction
- **Planned at**: commit `321ef7e`, 2026-07-02 (revised 2026-07-05)

## Why this matters

DeviceSDK's growth channel is AI coding agents: a user asks Claude/Cursor "help
me build an IoT thing with a Pico", and the agent either knows about DeviceSDK
or it doesn't. The repo already has unusually good agent infrastructure
(`llms.txt`, per-page Markdown mirrors, an agentskills.io manifest, a
server-bundled MCP endpoint at `/mcp` from plan 003, `devicesdk init` writing
AGENTS.md/.mcp.json). What's missing is the **distribution** side: the skills
are not installable as a Claude Code plugin, the GitHub README (the #1 page
agents fetch) never mentions any of the agent affordances, and agents that
land on an HTML docs page have no machine-readable pointer to the Markdown
mirror. This plan closes those gaps. Each phase is independent - ship them as
separate commits on one branch.

## Current state

Repo facts (verified at commit `321ef7e`):

- **Public repo**: `github.com/device-sdk/devicesdk` (per `GITHUB_URL` in
  `apps/website/src/config.ts:9` and `repository.url` in every package.json).
  NOTE: the local `origin` remote points at `device-sdk/devicesdk-monorepo`.
  Per repo policy (CLAUDE.md "Git Workflow"), do NOT auto-open a PR when
  origin is not `device-sdk/devicesdk` - finish, then report and ask.
- **MCP**: after plan 003, the MCP server is built into `apps/server` at
  `POST /mcp` (Streamable HTTP, OAuth 2.1 or Bearer API token; default LAN
  URL `http://devicesdk.local:8080/mcp`); `devicesdk init` scaffolds an HTTP
  `.mcp.json` pointing at the user's server; `packages/mcp` no longer exists
  in the repo. Verify with `ls packages/mcp` → No such file (if it still
  exists, 003 has not landed - STOP, this plan runs after 003).
- **`apps/website/static/.well-known/agent-skills/`** - four skill dirs
  (`devicesdk-api`, `devicesdk-cli`, `devicesdk-firmware`,
  `devicesdk-overview`), each containing a `SKILL.md` with single-line YAML
  frontmatter (`name:`, `description:` only - the parser in
  `generate-agent-skills.js:8-21` supports nothing else).
- **`apps/website/generate-agent-skills.js`** - reads
  `static/.well-known/agent-skills/*/SKILL.md`, writes `index.json`
  (agentskills.io discovery schema). Invoked from the website `build` script
  (`apps/website/package.json`). `BASE` constant at line 5:
  ```js
  const BASE = "static/.well-known/agent-skills";
  ```
- **No Claude Code plugin marketplace** anywhere in the repo (no
  `.claude-plugin/` directory; `.claude/` contains only local worktrees and is
  not committed).
- **`apps/website/src/composables/useSiteHead.ts`** - per-page head:
  canonical link, OG/twitter meta, JSON-LD. Home page gets `Organization` +
  `WebSite` (lines 146-167); docs pages get `BreadcrumbList` + `TechArticle`.
  There is **no `SoftwareApplication`** schema and **no FAQPage** schema. The
  returned head object (lines 176-181):
  ```ts
  return {
    title: htmlTitle,
    link: [{ rel: "canonical", href: canonical }],
    meta,
    script: scripts,
  };
  ```
  Flags already computed in the same function: `isDocsLeaf` (line 118) is true
  for docs pages that are not section indexes - exactly the pages that have
  `.md` mirrors.
- **`apps/website/scripts/build-content.ts`** - generates the per-page
  Markdown mirrors (`<page>/index.md`, line 296), `llms.txt` copy (line 355),
  `llms-full.txt` (line 382), and `sitemap.xml` (lines 338-350) into
  `static/`. Generated outputs are gitignored (see the `clean` script in
  `apps/website/package.json`).
- **`apps/website/src/llms.txt`** - source of truth for `/llms.txt`. Already
  links `llms-full.txt` and the agent-skills manifest in its "Optional"
  section (lines 92-95).
- **`docs/public/resources/faq.md`** - FAQ page as `### Question` headings +
  answer paragraphs under `## Section` groupings, with standard frontmatter
  (`title`, `description`, `social_image`).
- **`README.md`** - sections: Philosophy, Run the server, Develop a device
  project, Building from source, Project Structure, Development, CLI,
  Architecture, Firmware, Documentation (line 178), License. **Zero mention**
  of the MCP server, llms.txt, AGENTS.md, or agent skills.
- **Repo conventions**: Biome linting via `pnpm lint`; conventional-commit
  messages (`feat(scope): ...`, `fix(scope): ...` - see `git log`); every PR
  needs a changeset (`pnpm changeset`); no em-dashes in prose; strict TS, no
  `any`; work in a dedicated worktree, never on main.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Website typecheck + content build | `pnpm lint --filter @devicesdk/website` | exit 0 (runs build-content then `tsc --noEmit`) |
| Website full build | `pnpm build --filter @devicesdk/website...` | exit 0; `apps/website/dist/` populated (builds server first for openapi.json) |
| Skills manifest regen | `cd apps/website && node generate-agent-skills.js` | `Wrote 4 skill entries ...` |
| Repo lint | `pnpm lint` | exit 0 |
| JSON validity | `jq . <file> > /dev/null` | exit 0 |
| Changeset | `pnpm changeset` | interactive; or write `.changeset/<name>.md` by hand following existing files in `.changeset/` |

## Suggested executor toolkit

- Before Phase 2, fetch the Claude Code plugin docs:
  <https://docs.claude.com/en/docs/claude-code/plugins> and
  <https://docs.claude.com/en/docs/claude-code/plugin-marketplaces>.

## Scope

**In scope** (the only files you should create/modify):

- `.claude-plugin/marketplace.json` (create)
- `plugins/devicesdk/.claude-plugin/plugin.json` (create)
- `plugins/devicesdk/skills/**` (create - becomes the canonical skills home)
- `apps/website/static/.well-known/agent-skills/**` (delete the four skill
  dirs after relocation; `index.json` stays generated)
- `apps/website/generate-agent-skills.js` (read from new location, copy into static)
- `apps/website/src/composables/useSiteHead.ts` (alternate-markdown link, SoftwareApplication, FAQPage)
- `apps/website/scripts/build-content.ts` (only if FAQ extraction needs it - Phase 5)
- `apps/website/src/composables/usePageContent.ts` (only if FAQ data needs plumbing - Phase 5)
- `apps/website/src/llms.txt` (mention the plugin marketplace)
- `README.md` (new "For AI agents" section)
- `.changeset/*.md` (new changeset)
- `plans/README.md` (status update)

**Out of scope** (do NOT touch, even though they look related):

- `apps/server/**`, `packages/cli/**`, `packages/core/**`, `firmware/**` - no
  runtime changes belong in this plan. In particular do not touch
  `packages/cli/src/commands/init.ts` even though it generates AGENTS.md.
- `apps/website/wrangler.toml`, `static/_headers`, `static/_redirects` - the
  Cloudflare hosting of the marketing site is deliberate (do not de-Cloudflare
  anything).
- `docs/public/**` content rewrites - the docs are good; this plan only adds
  metadata around them. (Reading `docs/public/resources/faq.md` for Phase 5 is
  fine; do not edit it.)
- Actually submitting to third-party directories (Smithery, awesome-selfhosted,
  etc.) - that is maintainer outreach, listed in the appendix for a human.
- Any `major` version bump.

## Git workflow

- Create a worktree: `git worktree add .worktrees/agent-discoverability -b agent-discoverability`
  and work only inside it (repo rule - never work in the main checkout).
- One commit per phase, conventional style, e.g.
  `feat(mcp): add server.json and registry publish for the official MCP registry`.
- Run `pnpm lint` before every commit.
- Changeset (one file is fine, created early): `@devicesdk/website: patch`.
  (`@devicesdk/mcp` no longer exists - plan 003 removed it.)
- Do NOT push or open a PR: origin is not `device-sdk/devicesdk` (see Current
  state). Finish, then report and ask the maintainer how to proceed.

## Steps

### Phase 1 - REJECTED (2026-07-05): MCP registry publication

This phase published `@devicesdk/mcp` (npm stdio package) to the official MCP
registry. Plan 003 deleted that package and bundled the MCP server into
`apps/server` at `/mcp`. The official registry has no useful entry shape for
a purely self-hosted remote (its `remotes` field requires a fixed public
URL), so there is nothing to publish. Do not implement anything for this
phase; do not touch `.github/workflows/release.yml`. Proceed to Phase 2.

### Phase 2 - Ship the skills as a Claude Code plugin marketplace

Goal: `claude plugin marketplace add device-sdk/devicesdk` (or `/plugin` in
the REPL) lets any Claude Code user install DeviceSDK's four skills. The
skills move to a top-level `plugins/` home (canonical), and the website build
copies them into `static/.well-known/agent-skills/` so the agentskills.io
manifest keeps working unchanged.

**Step 2.1**: `git mv` the four skill directories from
`apps/website/static/.well-known/agent-skills/{devicesdk-api,devicesdk-cli,devicesdk-firmware,devicesdk-overview}`
to `plugins/devicesdk/skills/{same-names}`. Do not edit the SKILL.md contents.

**Step 2.2**: Create `plugins/devicesdk/.claude-plugin/plugin.json`:

```json
{
  "name": "devicesdk",
  "description": "Build and operate DeviceSDK IoT projects: TypeScript device scripts, CLI deploy/flash workflow, firmware, and REST API knowledge.",
  "version": "0.1.0",
  "author": { "name": "DeviceSDK", "email": "hello@devicesdk.com", "url": "https://devicesdk.com" },
  "homepage": "https://devicesdk.com/docs/",
  "repository": "https://github.com/device-sdk/devicesdk",
  "license": "AGPL-3.0-only",
  "keywords": ["iot", "esp32", "raspberry-pi-pico", "typescript", "self-hosted"]
}
```

**Step 2.3**: Create `.claude-plugin/marketplace.json` at the repo root:

```json
{
  "name": "devicesdk",
  "owner": { "name": "DeviceSDK", "email": "hello@devicesdk.com" },
  "metadata": {
    "description": "Official DeviceSDK skills for Claude Code",
    "version": "0.1.0"
  },
  "plugins": [
    {
      "name": "devicesdk",
      "source": "./plugins/devicesdk",
      "description": "DeviceSDK IoT platform skills: device scripts, CLI workflow, firmware, REST API."
    }
  ]
}
```

Validate field names against the fetched plugin-marketplace docs; if the doc
schema disagrees with the above, the doc wins.

**Step 2.4**: Update `apps/website/generate-agent-skills.js` to read from the
new canonical location and copy into static before indexing. Change the top of
the script:

```js
const SOURCE = "../../plugins/devicesdk/skills";   // canonical skills home
const BASE = "static/.well-known/agent-skills";     // published mirror
```

and before the existing directory scan, remove any previously-copied skill
dirs under `BASE` (keep nothing else - `index.json` is rewritten anyway),
then recursively copy each skill dir from `SOURCE` into `BASE`
(`fs.cpSync(src, dest, { recursive: true })`). The rest of the script (parse
frontmatter, write `index.json`) is unchanged. Since the mirrored copies are
now build products, add `apps/website/static/.well-known/agent-skills/` to
`.gitignore` (check first whether website `.gitignore` or root `.gitignore` is
the repo's pattern - the `clean` script in `apps/website/package.json` lists
other generated statics; also append the dir to that `clean` script).

**Verify**:
- `cd apps/website && node generate-agent-skills.js` → `Wrote 4 skill entries to static/.well-known/agent-skills/index.json`
- `jq -r '.skills[].name' apps/website/static/.well-known/agent-skills/index.json` → the four names, alphabetical
- `git status` shows no tracked changes under `apps/website/static/.well-known/` (mirror is ignored)
- If a `claude` CLI is available: `claude plugin validate .` → passes. If not
  available, skip (do not install anything to get it).

**Step 2.5**: Mention the marketplace in the two agent-facing indexes:
- `apps/website/src/llms.txt` "Agent integrations" section: add a line
  `- Claude Code plugin: run \`/plugin marketplace add device-sdk/devicesdk\` then install the \`devicesdk\` plugin - four skills covering scripts, CLI, firmware, and the REST API.`
- README - handled in Phase 3.

**Verify**: `grep -c "plugin marketplace add" apps/website/src/llms.txt` → 1.

### Phase 3 - Agent-facing section in README.md

Insert a new `## For AI agents & LLMs` section immediately before
`## Documentation` (currently line 178). Content (adapt tone to the existing
README - direct, no marketing fluff):

```markdown
## For AI agents & LLMs

Working on a DeviceSDK project with an AI coding agent? Everything is set up for you:

- **MCP server, built in**: your DeviceSDK server serves MCP at `/mcp` (default `http://devicesdk.local:8080/mcp`) - agents get tools to deploy scripts, tail logs, set env vars, and query devices, with OAuth or an API token ([docs](https://devicesdk.com/docs/mcp/)). `devicesdk init` writes the `.mcp.json` for you.
- **Claude Code plugin**: `/plugin marketplace add device-sdk/devicesdk`, then install `devicesdk` - skills covering device scripts, the CLI workflow, firmware, and the REST API.
- **LLM-readable docs**: [`llms.txt`](https://devicesdk.com/llms.txt) index, [`llms-full.txt`](https://devicesdk.com/llms-full.txt) (all docs, one file), and every docs page mirrored as Markdown at `<page-url>/index.md`.
- **In-repo guidance**: [`AGENTS.md`](AGENTS.md) covers this monorepo; `@devicesdk/core` ships its own `AGENTS.md` with version-matched API guidance into `node_modules`.
- **Skills manifest**: [agentskills.io discovery index](https://devicesdk.com/.well-known/agent-skills/index.json).
```

**Verify**: `grep -n "## For AI agents" README.md` → one hit, line number <
the `## Documentation` line.

### Phase 4 - Advertise the Markdown mirrors from the HTML pages

In `apps/website/src/composables/useSiteHead.ts`, inside the `useHead`
callback, add an alternate link for docs leaves (the pages that have
`index.md` mirrors). Modify the returned `link` array:

```ts
const links: Array<Record<string, string>> = [
  { rel: "canonical", href: canonical },
];
if (isDocsLeaf) {
  links.push({
    rel: "alternate",
    type: "text/markdown",
    href: `${canonical}index.md`,
  });
}
```

and return `link: links`. (Canonical docs paths end in `/` - confirm by
checking `absoluteUrl`/`page.path` handling at lines 19-23 and 114; if a
canonical does not end in `/`, use `${canonical}/index.md`.)

**Verify**: `pnpm lint --filter @devicesdk/website` → exit 0. Then
`pnpm build --filter @devicesdk/website...` and
`grep -o 'rel="alternate"[^>]*text/markdown[^>]*' apps/website/dist/docs/quickstart/index.html`
→ one match pointing at `/docs/quickstart/index.md`.

### Phase 5 - Structured data: SoftwareApplication + FAQPage

**Step 5.1**: In `useSiteHead.ts`, extend the home-page JSON-LD block (lines
146-167) with a `SoftwareApplication` node pushed into the same
`jsonLdScript([...])` array:

```ts
const app: JsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "DeviceSDK",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Linux, macOS, Windows (Docker)",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  license: "https://www.gnu.org/licenses/agpl-3.0.html",
  url: `${SITE_URL}/`,
  downloadUrl: "https://github.com/device-sdk/devicesdk",
  softwareHelp: `${SITE_URL}/docs/`,
};
scripts.push(jsonLdScript([org, website, app]));
```

**Step 5.2**: FAQPage schema for `/docs/resources/faq/`. The FAQ source
(`docs/public/resources/faq.md`) is `### Question` headings with answer
paragraphs. Implementation: in `useSiteHead.ts`, when
`page.path === "/docs/resources/faq/"`, build a `FAQPage` node from the page's
raw markdown. Check `usePageContent.ts` first: if `PageData` already exposes
the raw markdown body, parse it there (split on `^### `, question = heading
text, answer = following text until the next `###`/`##`, stripped of markdown
syntax naively - links become their text, list markers dropped). If the raw
body is NOT available client-side, do the extraction in
`scripts/build-content.ts` instead and attach a `faq: Array<{q: string; a: string}>`
field to that page's entry in the generated content JSON, then consume it in
`useSiteHead.ts`. Cap answers at ~500 chars. Emit:

```ts
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
}
```

If neither the raw markdown nor a clean build-time hook is reachable within
~1h of effort, drop Step 5.2 (report it as skipped) - it is the lowest-value
item in this plan.

**Verify**: `pnpm build --filter @devicesdk/website...`, then
`grep -c 'SoftwareApplication' apps/website/dist/index.html` → ≥1, and (if 5.2
done) `grep -c 'FAQPage' apps/website/dist/docs/resources/faq/index.html` → ≥1.
Optionally paste the emitted JSON-LD into
<https://validator.schema.org/> manually - do not automate this.

### Final step: changeset + index

Write `.changeset/agent-discoverability.md` (patch bump for
`@devicesdk/website` only; model the file on an existing one in `.changeset/`).
Run `pnpm lint` at the repo root. Update the 002 row in `plans/README.md`.

## Test plan

This plan is metadata/build-tooling; no runtime code paths change, so no new
unit tests are required. The verification gates above are the test plan:

- `pnpm lint` (root) and `pnpm lint --filter @devicesdk/website` → exit 0.
- `node generate-agent-skills.js` regenerates a 4-entry `index.json` from the
  relocated skills.
- Full website build succeeds and the built HTML contains the new
  `rel="alternate"` link and `SoftwareApplication` JSON-LD.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `jq -e '.plugins[0].source' .claude-plugin/marketplace.json` prints `./plugins/devicesdk`
- [ ] `ls plugins/devicesdk/skills` shows the four skill dirs; `git ls-files apps/website/static/.well-known/agent-skills` is empty
- [ ] `cd apps/website && node generate-agent-skills.js` writes 4 entries
- [ ] `grep -n "## For AI agents" README.md` hits exactly once
- [ ] built `dist/docs/quickstart/index.html` contains a `text/markdown` alternate link; built `dist/index.html` contains `SoftwareApplication`
- [ ] A changeset exists bumping `@devicesdk/website` (patch)
- [ ] `pnpm lint` exits 0; `git status` shows no modifications outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `packages/mcp/` still exists in the repo (plan 003 has not landed yet -
  this plan must run after 003).
- The Claude Code marketplace docs require fields/layouts that conflict with
  the JSON given in Steps 2.2-2.3 in a way you cannot resolve from the docs.
- `generate-agent-skills.js` frontmatter parsing breaks on any relocated
  SKILL.md (it only supports single-line `key: value` - if a skill needs more,
  stop rather than extending the parser).
- The website build fails for reasons unrelated to your changes (e.g. missing
  `apps/server/openapi.json` - build the server first via
  `pnpm build --filter @devicesdk/server`; if it still fails, stop).
- Anything requires touching `apps/server`, `packages/cli`, `packages/core`,
  or the Cloudflare config.
- You are tempted to push or open a PR: origin is `device-sdk/devicesdk-monorepo`,
  not the canonical repo - report and ask instead.

## Maintenance notes

- **Skills now live in `plugins/devicesdk/skills/`**: anyone editing the
  website's agent-skills must edit there; the static dir is a build product.
  The plugin `version` in `plugin.json` should be bumped when skills change
  (manual for now; changesets ignores it - acceptable).
- **Reviewer focus**: `generate-agent-skills.js` now copies from
  `plugins/devicesdk/skills/` into static at build time - verify the website
  build stays deterministic and the mirror dir is properly gitignored.
- **Deferred (for a human, not an executor)** - see Appendix below.

## Appendix: maintainer outreach checklist (human tasks, not executor work)

Distribution channels that need a human account or judgment. Submission-ready
one-liner: "DeviceSDK - free, open-source (AGPL-3.0), self-hosted IoT
platform: write TypeScript device scripts, run the server on your own hardware,
connect ESP32 / Raspberry Pi Pico over WebSocket."

1. **awesome-selfhosted** (github.com/awesome-selfhosted/awesome-selfhosted) -
   fits "Internet of Things (IoT)" category; requires the project to meet
   their age/activity bar - check CONTRIBUTING first.
2. **awesome-mcp-servers** lists (punkpeye/awesome-mcp-servers and forks) -
   many have a self-hosted/remote section; PR describing the server-bundled
   `/mcp` endpoint (Streamable HTTP, OAuth 2.1, ships in the Docker image).
   Note: the official MCP registry itself is not applicable - it needs an npm
   package or a fixed public remote URL, and DeviceSDK has neither since plan
   003 removed `@devicesdk/mcp`.
3. **selfh.st / r/selfhosted / Home Assistant community forum** - launch-style
   posts; HA forum best after the HACS integration (plan 001) ships.
4. **GitHub repo polish** (needs repo admin): add topics `mcp`,
   `home-automation` variants are present - consider `agents`, `llm`,
   `claude`; set a social-preview image; pin the "For AI agents" README anchor
   in the repo description link.
5. **Anthropic MCP connector directory / Claude directory** submissions where
   an intake form exists at the time of submission.
