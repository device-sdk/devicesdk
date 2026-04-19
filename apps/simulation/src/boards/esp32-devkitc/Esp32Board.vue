<script setup lang="ts">
import { computed } from "vue";
import type { BoardDef, PinDef } from "../types";

const props = withDefaults(
	defineProps<{
		board: BoardDef;
		pinStates?: Record<
			number,
			{ active: boolean; glow?: "green" | "teal" | "red" | "yellow" }
		>;
		dropTargets?: Set<number>;
		invalidTargets?: Set<number>;
		dragging?: boolean;
	}>(),
	{
		pinStates: () => ({}),
		dropTargets: () => new Set<number>(),
		invalidTargets: () => new Set<number>(),
		dragging: false,
	},
);

const emit = defineEmits<{
	pinClick: [pin: PinDef, event: MouseEvent];
	pinPointerEnter: [pin: PinDef, event: PointerEvent];
	pinPointerLeave: [pin: PinDef, event: PointerEvent];
	pinDrop: [pin: PinDef, event: DragEvent];
	pinDragOver: [pin: PinDef, event: DragEvent];
}>();

const ROW_SPACING = 28;
const TOP_OFFSET = 110;
const BOTTOM_OFFSET = 40;
const BOARD_WIDTH = 260;
const PIN_HOLE_R = 6;
const HITBOX_W = 80;
const HITBOX_H = 26;

const boardHeight = computed(
	() => TOP_OFFSET + BOTTOM_OFFSET + props.board.rowCount * ROW_SPACING,
);

const leftPins = computed(() =>
	props.board.pins.filter((p) => p.side === "left"),
);
const rightPins = computed(() =>
	props.board.pins.filter((p) => p.side === "right"),
);

function pinY(row: number): number {
	return TOP_OFFSET + row * ROW_SPACING + ROW_SPACING / 2;
}

function pinCX(side: "left" | "right"): number {
	return side === "left" ? 10 : BOARD_WIDTH - 10;
}

function hitboxX(side: "left" | "right"): number {
	return side === "left" ? 0 : BOARD_WIDTH - HITBOX_W;
}

function pinFill(pin: PinDef): string {
	if (pin.kind === "power-3v3") return "#ff5252";
	if (pin.kind === "power-5v" || pin.kind === "power-vin") return "#ffb74d";
	if (pin.kind === "ground") return "#2e2e2e";
	if (pin.kind === "enable") return "#ce93d8";
	if (pin.attributes.includes("flash-reserved")) return "#802020";
	if (pin.kind === "input-only") return "#4fc3f7";
	return "#d4a017"; // GPIO — gold
}

function pinRing(pin: PinDef): string | null {
	if (pin.attributes.includes("strapping")) return "#ffd54f";
	if (pin.attributes.includes("flash-reserved")) return "#ef5350";
	if (pin.kind === "input-only") return "#4fc3f7";
	return null;
}

function pinHighlightClass(pin: PinDef): string {
	if (pin.gpio === null) return "";
	if (props.invalidTargets.has(pin.gpio)) return "pin-invalid";
	if (props.dropTargets.has(pin.gpio)) return "pin-valid";
	return "";
}

function pinStateGlow(pin: PinDef): string | null {
	if (pin.gpio === null) return null;
	const state = props.pinStates[pin.gpio];
	if (!state?.active) return null;
	return state.glow ?? "teal";
}

function pinLabelAnchor(side: "left" | "right"): "start" | "end" {
	return side === "left" ? "start" : "end";
}

function pinLabelX(side: "left" | "right"): number {
	return side === "left" ? 22 : BOARD_WIDTH - 22;
}

function functionHint(pin: PinDef): string {
	return pin.functions.slice(0, 2).join(" · ");
}

function isDroppable(pin: PinDef): boolean {
	if (pin.gpio === null) return false;
	if (pin.attributes.includes("flash-reserved")) return false;
	return true;
}

function onPinClick(pin: PinDef, event: MouseEvent) {
	emit("pinClick", pin, event);
}

function onPinDragOver(pin: PinDef, event: DragEvent) {
	if (!props.dragging) return;
	event.preventDefault();
	emit("pinDragOver", pin, event);
}

function onPinDrop(pin: PinDef, event: DragEvent) {
	if (!props.dragging) return;
	event.preventDefault();
	emit("pinDrop", pin, event);
}

function onPinPointerEnter(pin: PinDef, event: PointerEvent) {
	emit("pinPointerEnter", pin, event);
}

function onPinPointerLeave(pin: PinDef, event: PointerEvent) {
	emit("pinPointerLeave", pin, event);
}
</script>

<template>
	<svg
		class="esp32-board"
		:viewBox="`0 0 ${BOARD_WIDTH} ${boardHeight}`"
		:style="{ maxHeight: '80vh' }"
		preserveAspectRatio="xMidYMid meet"
		role="img"
		aria-label="ESP32 DevKit-C board"
	>
		<!-- PCB background -->
		<rect
			x="0"
			y="0"
			:width="BOARD_WIDTH"
			:height="boardHeight"
			rx="8"
			ry="8"
			fill="#1a2850"
			stroke="#0d1633"
			stroke-width="2"
		/>

		<!-- USB port at top -->
		<g :transform="`translate(${BOARD_WIDTH / 2 - 22}, 2)`">
			<rect width="44" height="18" rx="2" ry="2" fill="#8d8d8d" stroke="#505050" stroke-width="1" />
			<rect x="4" y="4" width="36" height="10" fill="#2c2c2c" />
		</g>

		<!-- Antenna trace top-left -->
		<path
			:d="`M 4 30 L 4 22 L 40 22 L 40 50 L 48 50 L 48 30 L 60 30`"
			stroke="#caa46a"
			stroke-width="1"
			fill="none"
		/>

		<!-- ESP32 module RF shield -->
		<g :transform="`translate(${BOARD_WIDTH / 2 - 60}, 50)`">
			<rect
				width="120"
				:height="boardHeight - 240"
				rx="3"
				ry="3"
				fill="url(#moduleGradient)"
				stroke="#555"
				stroke-width="1"
			/>
			<text
				x="60"
				y="36"
				text-anchor="middle"
				fill="#e5e5e5"
				font-size="14"
				font-weight="bold"
				font-family="monospace"
			>
				ESP32
			</text>
			<text
				x="60"
				y="54"
				text-anchor="middle"
				fill="#aaa"
				font-size="9"
				font-family="monospace"
			>
				WROOM-32
			</text>
			<text
				x="60"
				y="70"
				text-anchor="middle"
				fill="#888"
				font-size="7"
				font-family="monospace"
			>
				ESP-WROOM-32E
			</text>
		</g>

		<!-- Buttons at bottom -->
		<g :transform="`translate(16, ${boardHeight - 32})`">
			<rect width="28" height="20" rx="2" fill="#2a2a2a" stroke="#555" stroke-width="1" />
			<text x="14" y="13" text-anchor="middle" fill="#999" font-size="7" font-family="monospace">EN</text>
		</g>
		<g :transform="`translate(${BOARD_WIDTH - 44}, ${boardHeight - 32})`">
			<rect width="28" height="20" rx="2" fill="#2a2a2a" stroke="#555" stroke-width="1" />
			<text x="14" y="13" text-anchor="middle" fill="#999" font-size="7" font-family="monospace">BOOT</text>
		</g>

		<defs>
			<linearGradient id="moduleGradient" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#6a6a6a" />
				<stop offset="30%" stop-color="#4a4a4a" />
				<stop offset="100%" stop-color="#2a2a2a" />
			</linearGradient>
			<radialGradient id="pinGlow-teal">
				<stop offset="0%" stop-color="#00ffcc" stop-opacity="0.9" />
				<stop offset="100%" stop-color="#00ffcc" stop-opacity="0" />
			</radialGradient>
			<radialGradient id="pinGlow-green">
				<stop offset="0%" stop-color="#4ade80" stop-opacity="0.9" />
				<stop offset="100%" stop-color="#4ade80" stop-opacity="0" />
			</radialGradient>
			<radialGradient id="pinGlow-yellow">
				<stop offset="0%" stop-color="#facc15" stop-opacity="0.9" />
				<stop offset="100%" stop-color="#facc15" stop-opacity="0" />
			</radialGradient>
			<radialGradient id="pinGlow-red">
				<stop offset="0%" stop-color="#ef4444" stop-opacity="0.9" />
				<stop offset="100%" stop-color="#ef4444" stop-opacity="0" />
			</radialGradient>
		</defs>

		<!-- Pins -->
		<g
			v-for="pin in [...leftPins, ...rightPins]"
			:key="pin.physical"
			:class="['pin-group', pinHighlightClass(pin)]"
			:data-gpio="pin.gpio ?? ''"
			:data-physical="pin.physical"
			@click="onPinClick(pin, $event)"
			@pointerenter="onPinPointerEnter(pin, $event)"
			@pointerleave="onPinPointerLeave(pin, $event)"
			@dragover="onPinDragOver(pin, $event)"
			@drop="onPinDrop(pin, $event)"
		>
			<!-- Invisible hitbox for click + drop -->
			<rect
				:x="hitboxX(pin.side)"
				:y="pinY(pin.row) - HITBOX_H / 2"
				:width="HITBOX_W"
				:height="HITBOX_H"
				fill="transparent"
				:class="{ 'hitbox-droppable': isDroppable(pin) }"
			/>

			<!-- Glow for active pins -->
			<circle
				v-if="pinStateGlow(pin)"
				:cx="pinCX(pin.side)"
				:cy="pinY(pin.row)"
				r="14"
				:fill="`url(#pinGlow-${pinStateGlow(pin)})`"
				pointer-events="none"
			/>

			<!-- Pin hole / pad -->
			<circle
				:cx="pinCX(pin.side)"
				:cy="pinY(pin.row)"
				:r="PIN_HOLE_R"
				:fill="pinFill(pin)"
				:stroke="pinRing(pin) ?? '#0a0a0a'"
				:stroke-width="pinRing(pin) ? 2 : 1"
			/>
			<!-- Inner hole -->
			<circle
				:cx="pinCX(pin.side)"
				:cy="pinY(pin.row)"
				r="2"
				fill="#111"
				pointer-events="none"
			/>

			<!-- Label -->
			<text
				:x="pinLabelX(pin.side)"
				:y="pinY(pin.row) + 3"
				:text-anchor="pinLabelAnchor(pin.side)"
				fill="#fefefe"
				font-size="9"
				font-family="monospace"
				font-weight="bold"
				pointer-events="none"
			>
				{{ pin.shortLabel }}
			</text>

			<!-- Function hint (tiny, below label) -->
			<text
				v-if="pin.gpio !== null && functionHint(pin)"
				:x="pinLabelX(pin.side)"
				:y="pinY(pin.row) + 13"
				:text-anchor="pinLabelAnchor(pin.side)"
				fill="#7a9bb5"
				font-size="6"
				font-family="monospace"
				pointer-events="none"
			>
				{{ functionHint(pin) }}
			</text>
		</g>
	</svg>
</template>

<style scoped>
.esp32-board {
	display: block;
	width: 100%;
	user-select: none;
}

.pin-group {
	cursor: pointer;
	transition: filter 120ms ease;
}

.pin-group:hover {
	filter: brightness(1.15);
}

.pin-valid circle:first-of-type + circle {
	stroke: #4ade80 !important;
	stroke-width: 3 !important;
	filter: drop-shadow(0 0 6px #4ade80);
}

.pin-invalid {
	opacity: 0.35;
	cursor: not-allowed;
}
</style>
