# Known "Not Issues"

This file documents things that may look like release blockers or bugs at first glance, but are intentional given how the project is built, released, or self-hosted.

## npm release workflow does not set `NODE_AUTH_TOKEN`

**Why it looks like an issue:** `.github/workflows/release.yml` runs `pnpm release` (which calls `changeset publish`) without setting `NODE_AUTH_TOKEN`, `NPM_TOKEN`, or any other npm authentication env var.

**Why it is not an issue:** DeviceSDK publishes to npm using **npm Trusted Publishers**. The publishing step is authenticated via the OIDC trust relationship between GitHub Actions and the npm registry, not via a long-lived token in the workflow. No `NODE_AUTH_TOKEN` is required in the workflow file itself.
