<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import type { DisplayUpdateCommand } from "@devicesdk/core";
import { SSD1306 } from "@devicesdk/core/i2c";

const props = defineProps<{
	displayCommand?: DisplayUpdateCommand;
}>();

const emit = defineEmits<{
	log: [message: string];
}>();

const SCALE = 3;
const WIDTH = 128;
const HEIGHT = 64;
const BUFFER_SIZE = (WIDTH * HEIGHT) / 8;
const PIXEL_COLOR = "#00ffcc";
const BG_COLOR = "#111111";

const canvasRef = ref<HTMLCanvasElement | null>(null);
const framebuffer = new Uint8Array(BUFFER_SIZE);

function renderFramebuffer() {
	const canvas = canvasRef.value;
	if (!canvas) return;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	ctx.fillStyle = BG_COLOR;
	ctx.fillRect(0, 0, WIDTH * SCALE, HEIGHT * SCALE);

	ctx.fillStyle = PIXEL_COLOR;
	for (let page = 0; page < HEIGHT / 8; page++) {
		for (let x = 0; x < WIDTH; x++) {
			const byte = framebuffer[page * WIDTH + x];
			if (byte === 0) continue;
			for (let bit = 0; bit < 8; bit++) {
				if (byte & (1 << bit)) {
					const y = page * 8 + bit;
					ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
				}
			}
		}
	}
}

function decodeBase64(b64: string): Uint8Array {
	const raw = atob(b64);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) {
		bytes[i] = raw.charCodeAt(i);
	}
	return bytes;
}

function applyDisplayCommand(cmd: DisplayUpdateCommand) {
	if (cmd.payload.init) {
		framebuffer.fill(0);
	}

	for (const segment of cmd.payload.segments) {
		const data = decodeBase64(segment.data);
		framebuffer.set(data, segment.offset);
	}

	renderFramebuffer();
}

function runDemo() {
	const display = new SSD1306({
		address: "0x3C",
		width: WIDTH,
		height: HEIGHT,
	});

	display
		.clear()
		.drawText(4, 4, "DeviceSDK")
		.drawText(4, 16, "OLED Simulator")
		.drawLine(0, 26, 127, 26)
		.drawRect(4, 30, 40, 20)
		.drawCircle(90, 44, 14)
		.drawText(4, 54, "128x64 SSD1306");

	const cmd = display.toDisplayCommand({ init: true });
	applyDisplayCommand({ ...cmd, id: "demo" } as DisplayUpdateCommand);
	emit("log", "OLED Demo: rendered sample text and shapes");
}

watch(
	() => props.displayCommand,
	(cmd) => {
		if (cmd) applyDisplayCommand(cmd);
	},
);

onMounted(() => {
	renderFramebuffer();
});
</script>

<template>
	<div class="rounded-lg border bg-card text-card-foreground shadow-sm">
		<div class="flex items-center justify-between p-4 pb-2">
			<div>
				<h3 class="text-sm font-semibold leading-none tracking-tight">
					OLED Display
				</h3>
				<p class="text-xs text-muted-foreground mt-1">
					SSD1306 128x64
				</p>
			</div>
			<button
				class="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
				@click="runDemo"
			>
				Demo
			</button>
		</div>
		<div class="p-4 pt-2 flex justify-center">
			<canvas
				ref="canvasRef"
				:width="WIDTH * SCALE"
				:height="HEIGHT * SCALE"
				class="rounded border border-border"
				:style="{
					width: `${WIDTH * SCALE}px`,
					height: `${HEIGHT * SCALE}px`,
					backgroundColor: BG_COLOR,
					imageRendering: 'pixelated',
				}"
			/>
		</div>
	</div>
</template>
