<script setup lang="ts">
import { ref, onMounted } from "vue";
import * as d3 from "d3";

const svgRef = ref<SVGSVGElement | null>(null);
const active = ref<string | null>(null);

const states = [
	{
		id: "connect",
		label: "connect",
		x: 120,
		y: 160,
		detail: "TCP + WebSocket handshake; token authenticated.",
	},
	{
		id: "load",
		label: "load script",
		x: 300,
		y: 80,
		detail: "Dynamic import of the versioned bundle file.",
	},
	{
		id: "online",
		label: "online",
		x: 480,
		y: 160,
		detail: "onDeviceConnect fires; watchers receive status.",
	},
	{
		id: "run",
		label: "run handlers",
		x: 480,
		y: 280,
		detail: "FIFO promise chain dispatches events one at a time.",
	},
	{
		id: "cron",
		label: "tick crons",
		x: 640,
		y: 80,
		detail: "Connection-gated; missed slots are skipped.",
	},
	{
		id: "offline",
		label: "offline",
		x: 300,
		y: 240,
		detail: "Socket closes; session stays alive in the hub.",
	},
];

const links = [
	{ source: "connect", target: "load" },
	{ source: "load", target: "online" },
	{ source: "online", target: "run" },
	{ source: "run", target: "cron" },
	{ source: "run", target: "offline" },
	{ source: "offline", target: "connect" },
];

onMounted(() => {
	if (!svgRef.value) return;
	const svg = d3.select(svgRef.value);
	svg.selectAll("*").remove();
	const g = svg.append("g");

	g.selectAll("line")
		.data(links)
		.join("line")
		.attr("x1", (d) => states.find((n) => n.id === d.source)!.x)
		.attr("y1", (d) => states.find((n) => n.id === d.source)!.y)
		.attr("x2", (d) => states.find((n) => n.id === d.target)!.x)
		.attr("y2", (d) => states.find((n) => n.id === d.target)!.y)
		.attr("stroke", "#3f3f46")
		.attr("stroke-width", 2)
		.attr("marker-end", "url(#arrow-runtime)");

	g.append("defs")
		.append("marker")
		.attr("id", "arrow-runtime")
		.attr("viewBox", "0 -5 10 10")
		.attr("refX", 8)
		.attr("refY", 0)
		.attr("markerWidth", 6)
		.attr("markerHeight", 6)
		.attr("orient", "auto")
		.append("path")
		.attr("d", "M0,-5L10,0L0,5")
		.attr("fill", "#3f3f46");

	const node = g
		.selectAll("g.node")
		.data(states)
		.join("g")
		.attr("class", "node cursor-pointer")
		.attr("transform", (d) => `translate(${d.x},${d.y})`)
		.on("mouseenter", (_event, d) => {
			active.value = d.id;
		})
		.on("mouseleave", () => {
			active.value = null;
		});

	node
		.append("rect")
		.attr("x", -60)
		.attr("y", -22)
		.attr("width", 120)
		.attr("height", 44)
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
    <svg ref="svgRef" viewBox="0 0 800 360" class="w-full h-auto" aria-label="Device session runtime lifecycle"></svg>
    <div class="mt-4 min-h-[4rem] text-sm text-zinc-400">
      <span v-if="active">{{ states.find((n) => n.id === active)?.detail }}</span>
      <span v-else class="text-zinc-600">Hover over a state to see what happens inside the device session.</span>
    </div>
  </div>
</template>
