<script setup lang="ts">
import { computed, ref } from "vue";
import Esp32Board from "@/boards/esp32-devkitc/Esp32Board.vue";
import type { PinDef } from "@/boards/types";
import PinPopover from "@/components/pins/PinPopover.vue";
import { useDragDrop } from "@/composables/useDragDrop";
import { usePinStateStore } from "@/stores/pinState";
import { useSimulatorStore } from "@/stores/simulator";
import type { WidgetKind } from "@/stores/widgets";
import { useWidgetsStore } from "@/stores/widgets";

const simulator = useSimulatorStore();
const pinState = usePinStateStore();
const widgets = useWidgetsStore();
const { isDragging, validTargets, invalidTargets, pendingKind, endDrag } =
	useDragDrop();

const selectedPin = ref<PinDef | null>(null);
const popoverAnchor = ref<HTMLElement | SVGElement | null>(null);

const pinStates = computed(() => {
	const map: Record<
		number,
		{ active: boolean; glow?: "teal" | "yellow" | "red" | "green" }
	> = {};
	for (const pin of simulator.board.pins) {
		if (pin.gpio === null) continue;
		const s = pinState.get(pin.gpio);
		if (s.mode === "digital_output" && s.digitalState === "high") {
			map[pin.gpio] = { active: true, glow: "yellow" };
		} else if (s.mode === "pwm_output") {
			map[pin.gpio] = { active: true, glow: "teal" };
		} else if (s.mode === "analog_input" && s.analog && s.analog.voltage > 0) {
			map[pin.gpio] = { active: true, glow: "teal" };
		} else if (
			s.mode === "digital_input" &&
			s.monitoring?.enabled &&
			s.digitalState === "high"
		) {
			map[pin.gpio] = { active: true, glow: "green" };
		}
	}
	return map;
});

function onPinClick(pin: PinDef, event: MouseEvent) {
	if (isDragging.value) return;
	if (pin.gpio === null) {
		selectedPin.value = null;
		popoverAnchor.value = null;
		return;
	}
	const group = (event.currentTarget as Element) ?? (event.target as Element);
	popoverAnchor.value = group as HTMLElement;
	selectedPin.value = pin;
}

function closePopover() {
	selectedPin.value = null;
	popoverAnchor.value = null;
}

function onPinDrop(pin: PinDef, _event: DragEvent) {
	const kind = pendingKind();
	if (!kind || pin.gpio === null) {
		endDrag();
		return;
	}
	if (!validTargets.value.has(pin.gpio)) {
		endDrag();
		return;
	}
	widgets.place({
		kind: kind as WidgetKind,
		pins: { pin: pin.gpio },
		config: {},
	});
	simulator.addLog(`Placed ${kind} on ${pin.label}`);
	endDrag();
}

function onStageDragEnd() {
	endDrag();
}
</script>

<template>
	<section
		class="relative flex flex-col items-center justify-center h-full overflow-auto bg-background/50 p-4"
		@dragend="onStageDragEnd"
	>
		<div class="w-full max-w-xs">
			<Esp32Board
				:board="simulator.board"
				:pin-states="pinStates"
				:drop-targets="validTargets"
				:invalid-targets="invalidTargets"
				:dragging="isDragging"
				@pin-click="onPinClick"
				@pin-drop="onPinDrop"
			/>
		</div>

		<p
			v-if="isDragging"
			class="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-primary/90 text-primary-foreground text-xs px-3 py-1 shadow-lg"
		>
			Drop on a green pin to attach
		</p>

		<PinPopover
			v-if="selectedPin"
			:pin="selectedPin"
			:anchor="popoverAnchor"
			@close="closePopover"
		/>
	</section>
</template>
