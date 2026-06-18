<script setup lang="ts">
import { useHead } from "@vueuse/head";
import MarketingLayout from "~/components/layout/MarketingLayout.vue";
import ArchitectureTopology from "~/components/diagrams/ArchitectureTopology.vue";

useHead({
	title: "Platform Architecture | DeviceSDK",
	meta: [
		{
			name: "description",
			content:
				"How DeviceSDK's self-hosted Bun server, device runtime, and dashboard work together.",
		},
	],
});
</script>

<template>
  <MarketingLayout>
    <section class="py-24 bg-zinc-950 text-zinc-100">
      <div class="max-w-5xl mx-auto px-6">
        <div class="text-center mb-16">
          <h1 class="text-4xl md:text-6xl font-semibold tracking-tight mb-6">
            Platform <span class="text-emerald-400">architecture</span>
          </h1>
          <p class="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto">
            A single, self-hosted Bun process runs the API, device WebSockets, dashboard, and in-process user scripts. No cloud required.
          </p>
        </div>

        <div class="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:p-10 mb-16">
          <ArchitectureTopology />
        </div>

        <div class="grid md:grid-cols-3 gap-6">
          <div class="card card-lift p-6 border border-zinc-800 bg-zinc-900/40 rounded-xl">
            <div class="text-emerald-400 font-mono text-sm mb-2">01</div>
            <h3 class="text-lg font-semibold mb-2">Devices connect over WebSocket</h3>
            <p class="text-sm text-zinc-400">
              ESP32 and Pico firmware open a WebSocket to the server, authenticate with a project-scoped token, and stream telemetry.
            </p>
          </div>
          <div class="card card-lift p-6 border border-zinc-800 bg-zinc-900/40 rounded-xl">
            <div class="text-emerald-400 font-mono text-sm mb-2">02</div>
            <h3 class="text-lg font-semibold mb-2">User scripts run in-process</h3>
            <p class="text-sm text-zinc-400">
              TypeScript DeviceEntrypoint classes are loaded dynamically per version, with a per-session FIFO queue for handler dispatch.
            </p>
          </div>
          <div class="card card-lift p-6 border border-zinc-800 bg-zinc-900/40 rounded-xl">
            <div class="text-emerald-400 font-mono text-sm mb-2">03</div>
            <h3 class="text-lg font-semibold mb-2">Dashboard watches live state</h3>
            <p class="text-sm text-zinc-400">
              The same-origin Vue dashboard observes device logs, state, and metrics through the watch WebSocket protocol.
            </p>
          </div>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
