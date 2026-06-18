<script setup lang="ts">
import { useHead } from "@vueuse/head";
import MarketingLayout from "~/components/layout/MarketingLayout.vue";

useHead({
	title: "Comparison | DeviceSDK Architecture",
	meta: [
		{
			name: "description",
			content:
				"How DeviceSDK compares to cloud IoT platforms, home-automation hubs, and self-hosted device runtimes.",
		},
	],
});

const rows = [
	{
		feature: "Self-hosted",
		devicesdk: true,
		cloud: false,
		ha: "partial",
		note: "You run the server; no cloud dependency.",
	},
	{
		feature: "Open source",
		devicesdk: true,
		cloud: false,
		ha: true,
		note: "AGPL-3.0-only; full source available.",
	},
	{
		feature: "No per-device fees",
		devicesdk: true,
		cloud: false,
		ha: true,
		note: "Device count is limited only by your hardware.",
	},
	{
		feature: "TypeScript scripts",
		devicesdk: true,
		cloud: "partial",
		ha: false,
		note: "Write device logic in TS, deploy with CLI.",
	},
	{
		feature: "In-process runtime",
		devicesdk: true,
		cloud: false,
		ha: false,
		note: "Scripts run on your server, not in firmware.",
	},
	{
		feature: "Cross-device RPC",
		devicesdk: true,
		cloud: "partial",
		ha: false,
		note: "Public methods callable between same-project devices.",
	},
	{
		feature: "Built-in dashboard",
		devicesdk: true,
		cloud: true,
		ha: true,
		note: "Vue SPA served same-origin by the server.",
	},
	{
		feature: "ESP32 / Pico firmware",
		devicesdk: true,
		cloud: "partial",
		ha: "partial",
		note: "Official C++ firmware with WebSocket + command model.",
	},
];

function icon(value: boolean | string) {
	if (value === true) return "✓";
	if (value === false) return "✕";
	return "~";
}

function cls(value: boolean | string) {
	if (value === true) return "text-emerald-400";
	if (value === false) return "text-zinc-500";
	return "text-amber-400";
}
</script>

<template>
  <MarketingLayout>
    <section class="py-24 bg-zinc-950 text-zinc-100">
      <div class="max-w-5xl mx-auto px-6">
        <div class="mb-16">
          <a href="/architecture/" class="text-sm text-emerald-400 hover:underline">← Architecture</a>
          <h1 class="text-4xl md:text-5xl font-semibold tracking-tight mt-4 mb-4">
            How DeviceSDK <span class="text-emerald-400">compares</span>
          </h1>
          <p class="text-lg text-zinc-400 max-w-2xl">
            No cloud lock-in, no per-device billing, and no walled garden. Just open-source software you run yourself.
          </p>
        </div>

        <div class="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/50">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-zinc-800">
                <th class="p-4 font-semibold text-zinc-300">Feature</th>
                <th class="p-4 font-semibold text-emerald-400">DeviceSDK</th>
                <th class="p-4 font-semibold text-zinc-300">Cloud IoT platforms</th>
                <th class="p-4 font-semibold text-zinc-300">Home-automation hubs</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.feature" class="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/40">
                <td class="p-4 font-medium text-zinc-200">{{ row.feature }}</td>
                <td class="p-4 font-mono text-lg" :class="cls(row.devicesdk)">{{ icon(row.devicesdk) }}</td>
                <td class="p-4 font-mono text-lg" :class="cls(row.cloud)">{{ icon(row.cloud) }}</td>
                <td class="p-4 font-mono text-lg" :class="cls(row.ha)">{{ icon(row.ha) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mt-6 text-xs text-zinc-500">
          ✓ = yes &nbsp; ~ = depends / partial &nbsp; ✕ = no
        </div>

        <div class="prose prose-invert max-w-none mt-16">
          <h2>When DeviceSDK fits</h2>
          <p>
            DeviceSDK is built for people who want to write real code for their devices, keep their data local, and avoid cloud subscriptions. If you prefer YAML-only automations, a home-automation hub may be simpler. If you need managed scaling across regions, a cloud platform is the right trade-off.
          </p>
          <p>
            For most personal, lab, and small-fleet IoT projects, DeviceSDK gives you the power of a custom backend without the cost or complexity of running one from scratch.
          </p>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
