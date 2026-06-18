<script setup lang="ts">
import { useHead } from "@vueuse/head";
import MarketingLayout from "~/components/layout/MarketingLayout.vue";
import DataFlowDiagram from "~/components/diagrams/DataFlowDiagram.vue";

useHead({
	title: "Data Flow | DeviceSDK Architecture",
	meta: [
		{
			name: "description",
			content:
				"How sensor events travel from firmware through WebSocket to user scripts and back as commands.",
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
            Data <span class="text-emerald-400">flow</span>
          </h1>
          <p class="text-lg text-zinc-400 max-w-2xl">
            From a GPIO edge on the device to a handler running in your own server, then back out as a command.
          </p>
        </div>

        <div class="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 md:p-10 mb-16">
          <DataFlowDiagram />
        </div>

        <div class="prose prose-invert max-w-none">
          <h2>Event lifecycle</h2>
          <p>
            When a configured GPIO pin changes state, the firmware bundles the pin number, new state, and timestamp into a JSON WebSocket frame. The server authenticates the frame against the device session and forwards it into the per-session FIFO queue.
          </p>
          <p>
            The user script's <code>onMessage</code> handler runs in-process. Because scripts run on hardware you own, they have access to the full Node/Bun ecosystem: files, sockets, serial, databases, and third-party packages.
          </p>
          <p>
            Replies are queued as commands with a 5-second ack timeout. If the device is offline, commands are held in the session until it reconnects or the queue fills.
          </p>

          <h2>Watchers</h2>
          <p>
            Dashboard and CLI sessions connect to the same WebSocket gateway as observers. They receive log, status, and state frames using the watch protocol, with optional backfill of recent history.
          </p>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
