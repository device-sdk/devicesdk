<script setup lang="ts">
import { ref, onMounted } from "vue";
import * as d3 from "d3";

const svgRef = ref<SVGSVGElement | null>(null);
const activeNode = ref<string | null>(null);

const nodes = [
	{
		id: "firmware",
		label: "Device Firmware",
		x: 120,
		y: 120,
		detail:
			"ESP32/Pico C++ firmware connects over WebSocket and forwards hardware events.",
	},
	{
		id: "websocket",
		label: "WebSocket Gateway",
		x: 320,
		y: 120,
		detail:
			"Bun WebSocket route upgrades device connections and authenticates sessions.",
	},
	{
		id: "session",
		label: "Device Session",
		x: 520,
		y: 120,
		detail:
			"Per-device FIFO promise chain, cron scheduler, KV store, and command dispatch.",
	},
	{
		id: "script",
		label: "User Script",
		x: 720,
		y: 120,
		detail:
			"TypeScript DeviceEntrypoint class loaded dynamically from versioned bundle.",
	},
	{
		id: "dashboard",
		label: "Dashboard",
		x: 520,
		y: 280,
		detail:
			"Vue dashboard served same-origin by the server for live watch and control.",
	},
];

const links = [
	{ source: "firmware", target: "websocket" },
	{ source: "websocket", target: "session" },
	{ source: "session", target: "script" },
	{ source: "session", target: "dashboard" },
];

onMounted(() => {
	if (!svgRef.value) return;
	const svg = d3.select(svgRef.value);
	svg.selectAll("*").remove();

	const g = svg.append("g");

	g.selectAll("line")
		.data(links)
		.join("line")
		.attr("x1", (d) => nodes.find((n) => n.id === d.source)!.x)
		.attr("y1", (d) => nodes.find((n) => n.id === d.source)!.y)
		.attr("x2", (d) => nodes.find((n) => n.id === d.target)!.x)
		.attr("y2", (d) => nodes.find((n) => n.id === d.target)!.y)
		.attr("stroke", "#3f3f46")
		.attr("stroke-width", 2);

	const node = g
		.selectAll("g.node")
		.data(nodes)
		.join("g")
		.attr("class", "node cursor-pointer")
		.attr("transform", (d) => `translate(${d.x},${d.y})`)
		.on("mouseenter", (_event, d) => {
			activeNode.value = d.id;
		})
		.on("mouseleave", () => {
			activeNode.value = null;
		});

	node
		.append("rect")
		.attr("x", -70)
		.attr("y", -25)
		.attr("width", 140)
		.attr("height", 50)
		.attr("rx", 8)
		.attr("fill", "#18181b")
		.attr("stroke", "#52525b")
		.attr("stroke-width", 1);

	node
		.append("text")
		.attr("text-anchor", "middle")
		.attr("dy", "0.35em")
		.attr("fill", "#e4e4e7")
		.attr("font-size", "12px")
		.attr("font-family", "JetBrains Mono, monospace")
		.text((d) => d.label);
});
</script>

<template>
  <div>
    <svg ref="svgRef" viewBox="0 0 840 360" class="w-full h-auto" aria-label="Architecture topology diagram"></svg>
    <div class="mt-4 min-h-[4rem] text-sm text-zinc-400">
      <span v-if="activeNode">
        {{ nodes.find((n) => n.id === activeNode)?.detail }}
      </span>
      <span v-else class="text-zinc-600">Hover over a node to see its responsibilities.</span>
    </div>
  </div>
</template>
