<script setup lang="ts">
import { ref, onMounted } from "vue";
import * as d3 from "d3";

const svgRef = ref<SVGSVGElement | null>(null);
const step = ref<number | null>(null);

const steps = [
	{
		label: "1. GPIO event",
		x: 80,
		y: 120,
		detail: "A sensor or pin change triggers an event on the microcontroller.",
	},
	{
		label: "2. WS frame",
		x: 280,
		y: 120,
		detail:
			"Firmware encodes the event and sends it as a JSON WebSocket frame.",
	},
	{
		label: "3. Session queue",
		x: 480,
		y: 120,
		detail:
			"The device session appends the event to its per-session FIFO promise chain.",
	},
	{
		label: "4. User handler",
		x: 680,
		y: 120,
		detail:
			"onMessage runs in-process, with access to DEVICE, DEVICES, VARS, and KV.",
	},
	{
		label: "5. Command reply",
		x: 480,
		y: 260,
		detail:
			"The handler can send commands back to the device or RPC another device.",
	},
	{
		label: "6. Device acts",
		x: 280,
		y: 260,
		detail:
			"The device receives the command and toggles outputs or reads sensors.",
	},
];

onMounted(() => {
	if (!svgRef.value) return;
	const svg = d3.select(svgRef.value);
	svg.selectAll("*").remove();

	const g = svg.append("g");

	g.selectAll("line.flow")
		.data(steps.slice(0, -1))
		.join("line")
		.attr("class", "flow")
		.attr("x1", (d) => d.x)
		.attr("y1", (d) => d.y)
		.attr("x2", (_d, i) => steps[i + 1].x)
		.attr("y2", (_d, i) => steps[i + 1].y)
		.attr("stroke", "#3f3f46")
		.attr("stroke-width", 2)
		.attr("marker-end", "url(#arrow)");

	g.append("defs")
		.append("marker")
		.attr("id", "arrow")
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
		.data(steps)
		.join("g")
		.attr("class", "node cursor-pointer")
		.attr("transform", (d) => `translate(${d.x},${d.y})`)
		.on("mouseenter", (_event: PointerEvent, d: (typeof steps)[number]) => {
			step.value = steps.indexOf(d);
		})
		.on("mouseleave", () => {
			step.value = null;
		});

	node
		.append("circle")
		.attr("r", 22)
		.attr("fill", "#18181b")
		.attr("stroke", "#10b981")
		.attr("stroke-width", 2);

	node
		.append("text")
		.attr("text-anchor", "middle")
		.attr("dy", "0.35em")
		.attr("fill", "#e4e4e7")
		.attr("font-size", "10px")
		.attr("font-family", "JetBrains Mono, monospace")
		.text((d) => d.label.split(".")[0]);

	node
		.append("text")
		.attr("text-anchor", "middle")
		.attr("y", 38)
		.attr("fill", "#a1a1aa")
		.attr("font-size", "11px")
		.attr("font-family", "Inter, system-ui, sans-serif")
		.text((d) => d.label.split(". ")[1]);
});
</script>

<template>
  <div>
    <svg ref="svgRef" viewBox="0 0 800 360" class="w-full h-auto" aria-label="Device data flow diagram"></svg>
    <div class="mt-4 min-h-[4rem] text-sm text-zinc-400">
      <span v-if="step !== null">{{ steps[step].detail }}</span>
      <span v-else class="text-zinc-600">Hover over a step to trace the packet path.</span>
    </div>
  </div>
</template>
