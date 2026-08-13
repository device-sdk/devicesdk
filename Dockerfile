# DeviceSDK self-hosted server image: Bun API/WebSocket server + dashboard SPA.
#
#   docker build -t devicesdk .
#   docker run -p 8080:8080 -v ./data:/data devicesdk
#
# Multi-arch (amd64 + arm64 for Raspberry Pi) via docker buildx; see
# .github/workflows/docker.yml.

# ---- stage 1: build dashboard SPA + workspace packages (node toolchain) ----
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
# Workspace install scoped to what the image needs: server deps for the bun
# bundle, core for its dist, dashboard for the SPA build.
RUN pnpm install --frozen-lockfile \
	--filter @devicesdk/server... \
	--filter @devicesdk/dashboard... \
	--filter @repo/typescript-config
RUN pnpm build --filter @devicesdk/core \
	&& pnpm build --filter @devicesdk/dashboard

# ---- stage 2: bundle the server into a single file (bun toolchain) ----
FROM oven/bun:1.3.14 AS serverbuild
WORKDIR /repo
COPY --from=build /repo /repo
RUN cd apps/server \
	&& bun build src/server.ts --target=bun --outfile /out/server.js
# Build-time SQLite FTS5 index of apps/docs/src/content/docs/**/*.md for
# devicesdk_docs_search (offline, version-pinned to this image - see
# apps/server/scripts/build-docs-index.ts). Docs reach the build context via
# stage 1's `COPY . .` (apps/docs is not excluded by .dockerignore).
RUN cd apps/server \
	&& bun run scripts/build-docs-index.ts ../../apps/docs/src/content/docs /out/docs-index.sqlite

# ---- stage 3: minimal runtime ----
FROM oven/bun:1.3.14-slim
WORKDIR /app
COPY --from=serverbuild /out/server.js /app/server.js
COPY --from=serverbuild /out/docs-index.sqlite /app/docs-index.sqlite
COPY --from=build /repo/apps/server/migrations /app/migrations
COPY --from=build /repo/apps/dashboard/dist/spa /app/public

ENV PORT=8080 \
	DATA_DIR=/data \
	PUBLIC_DIR=/app/public \
	MIGRATIONS_DIR=/app/migrations \
	DOCS_INDEX_PATH=/app/docs-index.sqlite

# Run as an unprivileged user. The bun image ships a `bun` group/user (uid 1000),
# so reuse it rather than creating a new account that may collide with the host.
RUN mkdir -p /data && chown -R bun:bun /app /data
USER bun

EXPOSE 8080
VOLUME /data

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
	CMD bun -e "fetch('http://localhost:' + (process.env.PORT || 8080) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "run", "/app/server.js"]
