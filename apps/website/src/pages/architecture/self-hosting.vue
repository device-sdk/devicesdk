<script setup lang="ts">
import { useHead } from "@vueuse/head";
import MarketingLayout from "~/components/layout/MarketingLayout.vue";
import TerminalBlock from "~/components/ui/TerminalBlock.vue";

useHead({
	title: "Self-hosting | DeviceSDK Architecture",
	meta: [
		{
			name: "description",
			content:
				"Deploy DeviceSDK on a Raspberry Pi, NUC, NAS, or any Docker host. One container serves API, WebSockets, dashboard, and scripts.",
		},
	],
});

const dockerCompose = `version: "3.8"
services:
  devicesdk:
    image: ghcr.io/device-sdk/devicesdk:latest
    container_name: devicesdk
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
    environment:
      - DATA_DIR=/data
      - PORT=8080
    restart: unless-stopped`;

const run = `docker run -d \\
  --name devicesdk \\
  -p 8080:8080 \\
  -v $(pwd)/data:/data \\
  -e DATA_DIR=/data \\
  ghcr.io/device-sdk/devicesdk:latest`;
</script>

<template>
  <MarketingLayout>
    <section class="py-24 bg-zinc-950 text-zinc-100">
      <div class="max-w-5xl mx-auto px-6">
        <div class="mb-16">
          <a href="/architecture/" class="text-sm text-emerald-400 hover:underline">← Architecture</a>
          <h1 class="text-4xl md:text-5xl font-semibold tracking-tight mt-4 mb-4">
            Self-<span class="text-emerald-400">hosting</span>
          </h1>
          <p class="text-lg text-zinc-400 max-w-2xl">
            DeviceSDK ships as a single Docker image. You run it on your own hardware; your data stays on your own disk.
          </p>
        </div>

        <div class="grid md:grid-cols-2 gap-8 mb-16">
          <div>
            <h2 class="text-2xl font-semibold mb-4">One container, one port</h2>
            <ul class="space-y-3 text-zinc-400">
              <li class="flex gap-3"><span class="text-emerald-400">✓</span> REST API on <code>/v1/*</code></li>
              <li class="flex gap-3"><span class="text-emerald-400">✓</span> Device + watcher WebSockets</li>
              <li class="flex gap-3"><span class="text-emerald-400">✓</span> Dashboard SPA served same-origin</li>
              <li class="flex gap-3"><span class="text-emerald-400">✓</span> SQLite state under <code>DATA_DIR</code></li>
              <li class="flex gap-3"><span class="text-emerald-400">✓</span> mDNS advertisement on LAN</li>
            </ul>
          </div>
          <TerminalBlock :content="dockerCompose" title="docker-compose.yml" />
        </div>

        <div class="mb-16">
          <h2 class="text-2xl font-semibold mb-4">Run with Docker</h2>
          <TerminalBlock :content="run" title="Terminal" />
        </div>

        <div class="prose prose-invert max-w-none">
          <h2>Hardware requirements</h2>
          <p>
            The server runs comfortably on a Raspberry Pi 4 or newer, an Intel NUC, a home NAS, or any host that supports Docker. Memory usage is dominated by the number of active device sessions and the size of user scripts.
          </p>

          <h2>TLS</h2>
          <p>
            For local LAN development, devices connect over plain WebSocket when the host includes an explicit port. For production or remote access, place the container behind a reverse proxy (nginx, Traefik, Caddy, Cloudflare Tunnel) that terminates TLS on port 443.
          </p>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
