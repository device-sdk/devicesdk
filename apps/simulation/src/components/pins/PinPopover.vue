<script setup lang="ts">
import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/vue";
import { computed, ref, watch } from "vue";
import {
	describeFunctions,
	getCapability,
	isFlashReserved,
	isStrapping,
	supportsAnalog,
	supportsOutput,
} from "@/boards/esp32-devkitc/capabilities";
import type { PinDef, PinMode } from "@/boards/types";
import { usePinStateStore } from "@/stores/pinState";
import { useSimulatorStore } from "@/stores/simulator";

const props = defineProps<{
	pin: PinDef;
	anchor: HTMLElement | SVGElement | null;
}>();

const emit = defineEmits<{
	close: [];
}>();

const pinState = usePinStateStore();
const simulator = useSimulatorStore();

const floatingRef = ref<HTMLElement | null>(null);
const triggerRef = computed(() => props.anchor);

const { floatingStyles } = useFloating(triggerRef, floatingRef, {
	placement: "right",
	middleware: [offset(12), flip(), shift({ padding: 8 })],
	whileElementsMounted: autoUpdate,
});

const state = computed(() =>
	props.pin.gpio !== null ? pinState.get(props.pin.gpio) : null,
);

const capability = computed(() =>
	props.pin.gpio !== null ? getCapability(props.pin.gpio) : null,
);

const isOutputCapable = computed(
	() => props.pin.gpio !== null && supportsOutput(props.pin.gpio),
);

const isAdcCapable = computed(
	() => props.pin.gpio !== null && supportsAnalog(props.pin.gpio),
);

const warnings = computed(() => {
	if (props.pin.gpio === null) return [];
	const w: string[] = [];
	if (isFlashReserved(props.pin.gpio)) {
		w.push("Reserved for internal flash — do not use.");
	}
	if (isStrapping(props.pin.gpio)) {
		w.push("Strapping pin — affects boot mode. Use with caution.");
	}
	if (props.pin.attributes.includes("usb-serial")) {
		w.push("Used by USB serial (UART0). Avoid for general I/O.");
	}
	if (capability.value?.adc?.unit === 2) {
		w.push("ADC2 is unavailable while WiFi is active.");
	}
	return w;
});

const availableModes = computed<{ value: PinMode; label: string }[]>(() => {
	const modes: { value: PinMode; label: string }[] = [
		{ value: "digital_input", label: "Digital Input" },
	];
	if (isOutputCapable.value) {
		modes.push(
			{ value: "digital_output", label: "Digital Output" },
			{ value: "pwm_output", label: "PWM Output" },
		);
	}
	if (isAdcCapable.value) {
		modes.push({ value: "analog_input", label: "Analog Input" });
	}
	return modes;
});

const functions = computed(() =>
	props.pin.gpio !== null ? describeFunctions(props.pin.gpio) : [],
);

function onClickOutside(event: MouseEvent) {
	const target = event.target as Node;
	if (floatingRef.value?.contains(target)) return;
	if (props.anchor instanceof Element && props.anchor.contains(target)) return;
	emit("close");
}

watch(
	() => props.anchor,
	(anchor) => {
		if (anchor) {
			document.addEventListener("mousedown", onClickOutside);
		} else {
			document.removeEventListener("mousedown", onClickOutside);
		}
	},
	{ immediate: true },
);

function handleModeChange(event: Event) {
	if (props.pin.gpio === null) return;
	const newMode = (event.target as HTMLSelectElement).value as PinMode;
	pinState.setMode(props.pin.gpio, newMode);
	simulator.addLog(
		`${props.pin.label} configured as ${newMode.replace("_", " ")}`,
	);
}

function toggleDigital() {
	if (props.pin.gpio === null || !state.value) return;
	const next = state.value.digitalState === "high" ? "low" : "high";
	pinState.setDigital(props.pin.gpio, next);
	simulator.addLog(
		`${props.pin.label} → ${next.toUpperCase()}`,
		"set_gpio_state",
	);
}

function handlePwmFrequency(event: Event) {
	if (props.pin.gpio === null || !state.value?.pwm) return;
	const v = Number.parseInt((event.target as HTMLInputElement).value, 10);
	if (Number.isNaN(v) || v < 1) return;
	pinState.setPwm(props.pin.gpio, { ...state.value.pwm, frequency: v });
}

function handlePwmDuty(event: Event) {
	if (props.pin.gpio === null || !state.value?.pwm) return;
	const pct = Number.parseInt((event.target as HTMLInputElement).value, 10);
	pinState.setPwm(props.pin.gpio, {
		...state.value.pwm,
		dutyCycle: pct / 100,
	});
}

function handleVoltage(event: Event) {
	if (props.pin.gpio === null) return;
	const volts =
		Number.parseFloat((event.target as HTMLInputElement).value) / 100;
	pinState.setAnalog(props.pin.gpio, volts);
}

function handleMonitoringToggle() {
	if (props.pin.gpio === null || !state.value) return;
	const current = state.value.monitoring ?? {
		enabled: false,
		pull: "none" as const,
	};
	pinState.setMonitoring(props.pin.gpio, {
		...current,
		enabled: !current.enabled,
	});
}

function handlePullChange(event: Event) {
	if (props.pin.gpio === null || !state.value) return;
	const pull = (event.target as HTMLSelectElement).value as
		| "up"
		| "down"
		| "none";
	const current = state.value.monitoring ?? { enabled: false, pull: "none" };
	pinState.setMonitoring(props.pin.gpio, { ...current, pull });
}

function simulateInput() {
	if (props.pin.gpio === null || !state.value) return;
	const next = state.value.digitalState === "high" ? "low" : "high";
	pinState.setDigital(props.pin.gpio, next);
	simulator.addLog(
		`${props.pin.label} input → ${next.toUpperCase()}`,
		"configure_gpio_input_monitoring",
	);
}
</script>

<template>
	<Teleport to="body">
		<div
			ref="floatingRef"
			:style="floatingStyles"
			class="z-50 w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg p-4 space-y-3"
		>
			<!-- Header -->
			<div class="flex justify-between items-start">
				<div>
					<h4 class="font-bold">{{ pin.label }}</h4>
					<p class="text-xs text-muted-foreground">Pin {{ pin.physical }}</p>
				</div>
				<span
					v-if="pin.gpio !== null"
					class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground"
				>
					GPIO {{ pin.gpio }}
				</span>
			</div>

			<!-- Warnings -->
			<div v-if="warnings.length > 0" class="space-y-1">
				<div
					v-for="(w, i) in warnings"
					:key="i"
					class="rounded-md border border-amber-400/40 bg-amber-50 px-2 py-1 text-[11px] text-amber-900"
				>
					{{ w }}
				</div>
			</div>

			<!-- Function badges -->
			<div v-if="functions.length > 0" class="flex flex-wrap gap-1">
				<span
					v-for="fn in functions"
					:key="fn"
					class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-secondary text-secondary-foreground"
				>
					{{ fn }}
				</span>
			</div>

			<div v-if="pin.gpio !== null && state" class="space-y-3">
				<div class="h-px bg-border" />

				<!-- Mode selector -->
				<div class="space-y-1">
					<label
						:for="`mode-${pin.gpio}`"
						class="text-xs font-medium text-muted-foreground"
					>
						Mode
					</label>
					<select
						:id="`mode-${pin.gpio}`"
						:value="state.mode"
						class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
						@change="handleModeChange"
					>
						<option
							v-for="m in availableModes"
							:key="m.value"
							:value="m.value"
						>
							{{ m.label }}
						</option>
					</select>
				</div>

				<!-- Digital Output -->
				<div v-if="state.mode === 'digital_output'" class="space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium">
							State: {{ state.digitalState.toUpperCase() }}
						</span>
						<button
							class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
							role="switch"
							:aria-checked="state.digitalState === 'high'"
							:class="
								state.digitalState === 'high'
									? 'bg-primary'
									: 'bg-input'
							"
							@click="toggleDigital"
						>
							<span
								class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg transition-transform"
								:class="
									state.digitalState === 'high'
										? 'translate-x-5'
										: 'translate-x-0'
								"
							/>
						</button>
					</div>
				</div>

				<!-- Digital Input -->
				<div v-if="state.mode === 'digital_input'" class="space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium">
							Current: {{ state.digitalState.toUpperCase() }}
						</span>
					</div>
					<div class="space-y-2 rounded-md border p-2">
						<div class="flex items-center justify-between">
							<label class="text-xs font-medium">Input Monitoring</label>
							<button
								class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
								role="switch"
								:aria-checked="state.monitoring?.enabled ?? false"
								:class="
									state.monitoring?.enabled
										? 'bg-primary'
										: 'bg-input'
								"
								@click="handleMonitoringToggle"
							>
								<span
									class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform"
									:class="
										state.monitoring?.enabled
											? 'translate-x-4'
											: 'translate-x-0'
									"
								/>
							</button>
						</div>
						<div v-if="state.monitoring?.enabled" class="space-y-2">
							<div class="flex items-center justify-between">
								<label class="text-xs text-muted-foreground">
									Pull Resistor
								</label>
								<select
									:value="state.monitoring?.pull ?? 'none'"
									class="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
									@change="handlePullChange"
								>
									<option value="none">None</option>
									<option value="up">Pull Up</option>
									<option value="down">Pull Down</option>
								</select>
							</div>
						</div>
					</div>
					<button
						class="w-full inline-flex items-center justify-center gap-1 rounded-md text-xs font-medium h-7 px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
						@click="simulateInput"
					>
						Simulate Input Change
					</button>
				</div>

				<!-- PWM -->
				<div v-if="state.mode === 'pwm_output'" class="space-y-3">
					<div class="space-y-1">
						<label class="text-xs font-medium text-muted-foreground">
							Frequency (Hz)
						</label>
						<input
							type="number"
							min="1"
							max="100000"
							:value="state.pwm?.frequency ?? 1000"
							class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
							@change="handlePwmFrequency"
						/>
					</div>
					<div class="space-y-1">
						<div class="flex justify-between">
							<label class="text-xs font-medium text-muted-foreground">
								Duty Cycle
							</label>
							<span class="text-xs text-muted-foreground">
								{{ Math.round((state.pwm?.dutyCycle ?? 0) * 100) }}%
							</span>
						</div>
						<input
							type="range"
							min="0"
							max="100"
							:value="Math.round((state.pwm?.dutyCycle ?? 0) * 100)"
							class="w-full h-2 rounded-full appearance-none bg-input accent-primary cursor-pointer"
							@input="handlePwmDuty"
						/>
					</div>
				</div>

				<!-- Analog -->
				<div v-if="state.mode === 'analog_input'" class="space-y-3">
					<div class="space-y-1">
						<div class="flex justify-between">
							<label class="text-xs font-medium text-muted-foreground">
								Voltage
							</label>
							<span class="text-xs text-muted-foreground">
								{{ (state.analog?.voltage ?? 0).toFixed(2) }}V
							</span>
						</div>
						<input
							type="range"
							min="0"
							max="330"
							:value="Math.round((state.analog?.voltage ?? 0) * 100)"
							class="w-full h-2 rounded-full appearance-none bg-input accent-blue-500 cursor-pointer"
							@input="handleVoltage"
						/>
					</div>
					<div class="flex items-center justify-between text-xs">
						<span class="text-muted-foreground">Raw ADC Value:</span>
						<span class="font-mono font-medium">
							{{ state.analog?.raw ?? 0 }}
						</span>
					</div>
				</div>
			</div>
		</div>
	</Teleport>
</template>
