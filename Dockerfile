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
FROM oven/bun:1 AS serverbuild
WORKDIR /repo
COPY --from=build /repo /repo
RUN cd apps/server \
	&& bun build src/server.ts --target=bun --outfile /out/server.js

# ---- stage 3: minimal runtime ----
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=serverbuild /out/server.js /app/server.js
COPY --from=build /repo/apps/server/migrations /app/migrations
COPY --from=build /repo/apps/dashboard/dist/spa /app/public

ENV PORT=8080 \
	DATA_DIR=/data \
	PUBLIC_DIR=/app/public \
	MIGRATIONS_DIR=/app/migrations

EXPOSE 8080
VOLUME /data

CMD ["bun", "run", "/app/server.js"]
