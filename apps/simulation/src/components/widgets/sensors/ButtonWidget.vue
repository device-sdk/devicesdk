<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { findPinByGpio } from "@/boards/esp32-devkitc/board";
import { usePinStateStore } from "@/stores/pinState";
import { useSimulatorStore } from "@/stores/simulator";
import type { WidgetInstance } from "@/stores/widgets";
import { useWidgetsStore } from "@/stores/widgets";

const props = defineProps<{
	widget: WidgetInstance;
}>();

const pinStateStore = usePinStateStore();
const simulator = useSimulatorStore();
const widgets = useWidgetsStore();

const activeLow = computed(
	() => (props.widget.config.activeLow as boolean | undefined) ?? true,
);

const gpio = computed(() => props.widget.pins.pin);
const pin = computed(() => findPinByGpio(gpio.value));

const isPressed = ref(false);

const idleState = computed<"high" | "low">(() =>
	activeLow.value ? "high" : "low",
);

const pressedState = computed<"high" | "low">(() =>
	activeLow.value ? "low" : "high",
);

function driveState(next: "high" | "low") {
	if (gpio.value === undefined) return;
	pinStateStore.setDigital(gpio.value, next);
}

function startPress() {
	if (isPressed.value) return;
	isPressed.value = true;
	driveState(pressedState.value);
	simulator.addLog(
		`Button (GPIO ${gpio.value}) PRESS → ${pressedState.value.toUpperCase()}`,
		"configure_gpio_input_monitoring",
	);
}

function endPress() {
	if (!isPressed.value) return;
	isPressed.value = false;
	driveState(idleState.value);
	simulator.addLog(
		`Button (GPIO ${gpio.value}) RELEASE → ${idleState.value.toUpperCase()}`,
		"configure_gpio_input_monitoring",
	);
}

function clickOnce() {
	startPress();
	setTimeout(() => endPress(), 120);
}

function doubleClick() {
	clickOnce();
	setTimeout(() => clickOnce(), 240);
}

function toggleActiveLow() {
	widgets.update(props.widget.id, {
		config: { ...props.widget.config, activeLow: !activeLow.value },
	});
	// Re-drive the idle state with new polarity
	if (!isPressed.value) driveState(idleState.value);
}

onMounted(() => {
	// Set initial idle state on the pin so user code reads a sensible default
	if (gpio.value !== undefined) driveState(idleState.value);
});
</script>

<template>
	<div class="space-y-4">
		<div class="space-y-1">
			<h3 class="text-base font-semibold">Push Button</h3>
			<p class="text-xs text-muted-foreground">
				Bound to {{ pin?.label ?? `GPIO ${gpio}` }}
			</p>
		</div>

		<!-- Active polarity -->
		<div class="flex items-center justify-between rounded-md border p-3">
			<div>
				<p class="text-sm font-medium">Active Low</p>
				<p class="text-[11px] text-muted-foreground">
					{{
						activeLow
							? "Idle HIGH, press pulls pin LOW (pull-up wiring)"
							: "Idle LOW, press pulls pin HIGH"
					}}
				</p>
			</div>
			<button
				type="button"
				class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
				role="switch"
				:aria-checked="activeLow"
				:class="activeLow ? 'bg-primary' : 'bg-input'"
				@click="toggleActiveLow"
			>
				<span
					class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg transition-transform"
					:class="activeLow ? 'translate-x-5' : 'translate-x-0'"
				/>
			</button>
		</div>

		<!-- Press/Hold area -->
		<div class="space-y-2">
			<button
				type="button"
				class="w-full h-24 rounded-lg border-2 border-dashed transition-all select-none"
				:class="
					isPressed
						? 'bg-primary text-primary-foreground border-primary shadow-[inset_0_4px_10px_rgba(0,0,0,0.2)]'
						: 'bg-card hover:bg-accent/30 border-border'
				"
				@pointerdown.prevent="startPress"
				@pointerup="endPress"
				@pointerleave="endPress"
				@pointercancel="endPress"
			>
				<div class="flex flex-col items-center justify-center gap-1">
					<span class="text-2xl">{{ isPressed ? "◉" : "◯" }}</span>
					<span class="text-xs font-medium">
						{{ isPressed ? "HOLDING" : "Press & Hold" }}
					</span>
				</div>
			</button>
			<div class="grid grid-cols-2 gap-2">
				<button
					type="button"
					class="h-8 rounded-md border text-xs font-medium hover:bg-accent/40 transition-colors"
					@click="clickOnce"
				>
					Click
				</button>
				<button
					type="button"
					class="h-8 rounded-md border text-xs font-medium hover:bg-accent/40 transition-colors"
					@click="doubleClick"
				>
					Double-Click
				</button>
			</div>
		</div>

		<!-- Live state display -->
		<div
			class="rounded-md border bg-muted/30 p-3 text-center font-mono text-sm"
		>
			<p class="text-[10px] uppercase text-muted-foreground">Pin state</p>
			<p class="mt-1 text-base font-bold">
				{{ (isPressed ? pressedState : idleState).toUpperCase() }}
			</p>
		</div>
	</div>
</template>
