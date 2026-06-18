<script setup lang="ts">
import { useHead } from "@vueuse/head";
import MarketingLayout from "~/components/layout/MarketingLayout.vue";
import RuntimeDiagram from "~/components/diagrams/RuntimeDiagram.vue";

useHead({
	title: "Runtime | DeviceSDK Architecture",
	meta: [
		{
			name: "description",
			content:
				"How DeviceSDK's per-device session loads scripts, queues handlers, ticks crons, and survives reconnections.",
		},
	],
});
</script>

<template>
  <MarketingLayout>
    <section class="py-24 bg-zinc-950 text-zinc-100">
      <div class="max-w-5xl mx-auto px-6">
        <div class="mb-16">
          <a href="/architecture/" class="text-sm text-emerald-400 hover:underline">← Architecture</a>
          <h1 class="text-4xl md:text-5xl font-semibold tracking-tight mt-4 mb-4">
            Device <span class="text-emerald-400">runtime</span>
          </h1>
          <p class="text-lg text-zinc-400 max-w-2xl">
            A single Bun process hosts every device session. Each session is a long-lived object that outlives individual WebSocket connections.
          </p>
        </div>

        <div class="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:p-10 mb-16">
          <RuntimeDiagram />
        </div>

        <div class="grid md:grid-cols-2 gap-6 mb-16">
          <div class="card card-lift p-6 border border-zinc-800 bg-zinc-900/40 rounded-xl">
            <h3 class="text-lg font-semibold mb-2">Per-session FIFO queue</h3>
            <p class="text-sm text-zinc-400">
              Events and commands are serialized into a promise chain so user handlers never run concurrently for the same device.
            </p>
          </div>
          <div class="card card-lift p-6 border border-zinc-800 bg-zinc-900/40 rounded-xl">
            <h3 class="text-lg font-semibold mb-2">Connection-gated crons</h3>
            <p class="text-sm text-zinc-400">
              Cron slots only fire while the device is online. Missed slots are skipped, never caught up, keeping behaviour predictable.
            </p>
          </div>
          <div class="card card-lift p-6 border border-zinc-800 bg-zinc-900/40 rounded-xl">
            <h3 class="text-lg font-semibold mb-2">In-process scripts</h3>
            <p class="text-sm text-zinc-400">
              Scripts are dynamic imports of versioned bundle files. Each deployment creates a new file; the old one keeps running devices stable until they reconnect.
            </p>
          </div>
          <div class="card card-lift p-6 border border-zinc-800 bg-zinc-900/40 rounded-xl">
            <h3 class="text-lg font-semibold mb-2">RPC bridge</h3>
            <p class="text-sm text-zinc-400">
              Public class methods are exposed to other devices in the same project. Lifecycle methods and non-own methods are blocked from remote calls.
            </p>
          </div>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
