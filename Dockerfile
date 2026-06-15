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

# ---- stage 2.5: fetch prebuilt firmware binaries (best-effort) ----
# Firmware workflows publish versioned releases (tags firmware-esp32@vX.Y.Z /
# firmware-pico@vX.Y.Z) only when the changeset "Version packages" PR bumps a
# firmware version. The Dockerfile queries the GitHub API for the latest
# versioned release per family. Downloads are best-effort so the image still
# builds before the first firmware release exists (the firmware flash endpoint
# then reports "not published" until binaries are dropped into /data/firmwares).
FROM oven/bun:1.3.14-slim AS firmware
ARG FIRMWARE_REPO=device-sdk/devicesdk-monorepo
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
RUN mkdir -p /firmwares && cd /firmwares \
	&& base="https://github.com/${FIRMWARE_REPO}/releases/download" \
	&& api="https://api.github.com/repos/${FIRMWARE_REPO}/releases?per_page=100" \
	&& esp32_tag=$(curl -fsSL "$api" \
		| grep -oE '"tag_name": "firmware-esp32@v[^"]*"' \
		| head -1 \
		| sed -E 's/.*"([^"]+)".*/\1/' || true) \
	&& if [ -n "$esp32_tag" ]; then \
		for f in esp32-client.bin esp32c61-client.bin esp32c3-client.bin; do \
			curl -fsSL -o "$f" "$base/$esp32_tag/$f" || rm -f "$f"; \
		done; \
	fi \
	&& pico_tag=$(curl -fsSL "$api" \
		| grep -oE '"tag_name": "firmware-pico@v[^"]*"' \
		| head -1 \
		| sed -E 's/.*"([^"]+)".*/\1/' || true) \
	&& if [ -n "$pico_tag" ]; then \
		for f in devicesdk-pico-w-client.uf2 devicesdk-pico2-w-client.uf2; do \
			curl -fsSL -o "$f" "$base/$pico_tag/$f" || rm -f "$f"; \
		done; \
	fi \
	&& ls -la /firmwares

# ---- stage 3: minimal runtime ----
FROM oven/bun:1.3.14-slim
WORKDIR /app
COPY --from=serverbuild /out/server.js /app/server.js
COPY --from=build /repo/apps/server/migrations /app/migrations
COPY --from=build /repo/apps/dashboard/dist/spa /app/public
COPY --from=firmware /firmwares /app/firmwares-dist

ENV PORT=8080 \
	DATA_DIR=/data \
	PUBLIC_DIR=/app/public \
	MIGRATIONS_DIR=/app/migrations \
	FIRMWARES_DIST_DIR=/app/firmwares-dist

EXPOSE 8080
VOLUME /data

CMD ["bun", "run", "/app/server.js"]
