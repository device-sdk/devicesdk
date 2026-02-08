<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useFloating, offset, flip, shift, autoUpdate } from "@floating-ui/vue";
import type { PinType, PinMode } from "@/lib/types";
import {
	PIN_CAPABILITIES,
	describeI2cCapabilities,
} from "@/lib/pinCapabilities";

const props = defineProps<{
	pin: PinType;
	side: "left" | "right" | "center";
}>();

const emit = defineEmits<{
	update: [pin: PinType];
}>();

const isOpen = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const floatingRef = ref<HTMLElement | null>(null);

const placement = computed(() => {
	if (props.side === "left") return "left" as const;
	if (props.side === "right") return "right" as const;
	return "top" as const;
});

const { floatingStyles } = useFloating(triggerRef, floatingRef, {
	placement,
	middleware: [offset(8), flip(), shift({ padding: 8 })],
	whileElementsMounted: autoUpdate,
});

const isGpio = computed(() => props.pin.gpio !== null);
const isPowerOrGnd = computed(() => {
	const n = props.pin.name;
	return (
		n.includes("3V3") ||
		n.includes("GND") ||
		n.includes("VBUS") ||
		n.includes("VSYS")
	);
});
const isLed = computed(() => props.pin.id === 99);
const isSpecialNonGpio = computed(() => {
	const n = props.pin.name;
	return n === "RUN" || n === "ADC_VREF";
});

const isInteractive = computed(
	() =>
		(isGpio.value || isLed.value) &&
		!isPowerOrGnd.value &&
		!isSpecialNonGpio.value,
);

const capabilities = computed(() => {
	if (props.pin.gpio === null) return null;
	return PIN_CAPABILITIES[props.pin.gpio] ?? null;
});

const availableModes = computed<{ value: PinMode; label: string }[]>(() => {
	const modes: { value: PinMode; label: string }[] = [
		{ value: "digital_input", label: "Digital Input" },
		{ value: "digital_output", label: "Digital Output" },
		{ value: "pwm_output", label: "PWM Output" },
	];
	if (capabilities.value?.adc) {
		modes.push({ value: "analog_input", label: "Analog Input" });
	}
	return modes;
});

const capabilityBadges = computed(() => {
	if (props.pin.gpio === null) return [];
	const caps = capabilities.value;
	if (!caps) return [];
	const badges: string[] = ["Digital", "PWM"];
	if (caps.adc) badges.push("ADC");
	badges.push(...describeI2cCapabilities(props.pin.gpio));
	return badges;
});

const pwmAnimationDuration = computed(() => {
	if (props.pin.mode !== "pwm_output" || !props.pin.pwm) return "0s";
	const freq = Math.max(1, Math.min(props.pin.pwm.frequency, 10000));
	const ms = Math.max(100, Math.min(2000, (1000 / freq) * 100));
	return `${ms}ms`;
});

const pwmOpacity = computed(() => {
	if (props.pin.mode !== "pwm_output" || !props.pin.pwm) return 0.3;
	return 0.3 + props.pin.pwm.dutyCycle * 0.7;
});

// Pin dot classes based on mode and state
const pinDotClasses = computed(() => {
	if (isLed.value) {
		return props.pin.digitalState === "high"
			? "bg-green-400 shadow-[0_0_10px_2px_rgba(134,239,172,0.7)]"
			: "bg-green-900";
	}
	if (!isGpio.value) return "bg-gray-600";

	switch (props.pin.mode) {
		case "digital_output":
			return props.pin.digitalState === "high"
				? "bg-yellow-300 shadow-[0_0_8px_2px_rgba(253,224,71,0.6)]"
				: "bg-yellow-700";
		case "digital_input":
			return "bg-yellow-600";
		case "pwm_output":
			return "bg-orange-400 pin-pwm-pulse";
		case "analog_input":
			return "bg-blue-400";
		default:
			return "bg-yellow-400";
	}
});

function togglePopover() {
	if (!isInteractive.value) return;
	isOpen.value = !isOpen.value;
}

function closePopover() {
	isOpen.value = false;
}

function handleModeChange(event: Event) {
	const newMode = (event.target as HTMLSelectElement).value as PinMode;
	const updated: PinType = { ...props.pin, mode: newMode };

	// Initialize mode-specific defaults
	if (newMode === "pwm_output") {
		updated.pwm = updated.pwm ?? { frequency: 1000, dutyCycle: 0.5 };
		updated.analog = undefined;
		updated.monitoring = undefined;
	} else if (newMode === "analog_input") {
		updated.analog = updated.analog ?? { voltage: 0, raw: 0 };
		updated.pwm = undefined;
		updated.monitoring = undefined;
	} else if (newMode === "digital_input") {
		updated.monitoring = updated.monitoring ?? { enabled: false, pull: "none" };
		updated.pwm = undefined;
		updated.analog = undefined;
		updated.digitalState = "low";
	} else if (newMode === "digital_output") {
		updated.pwm = undefined;
		updated.analog = undefined;
		updated.monitoring = undefined;
		updated.digitalState = "low";
	}

	emit("update", updated);
}

function handleDigitalStateToggle() {
	emit("update", {
		...props.pin,
		digitalState: props.pin.digitalState === "high" ? "low" : "high",
	});
}

function handlePwmFrequencyChange(event: Event) {
	const freq = Number.parseInt((event.target as HTMLInputElement).value, 10);
	if (Number.isNaN(freq) || freq < 1) return;
	emit("update", {
		...props.pin,
		pwm: { ...props.pin.pwm!, frequency: freq },
	});
}

function handlePwmDutyChange(event: Event) {
	const pct = Number.parseInt((event.target as HTMLInputElement).value, 10);
	emit("update", {
		...props.pin,
		pwm: { ...props.pin.pwm!, dutyCycle: pct / 100 },
	});
}

function handleVoltageChange(event: Event) {
	const voltage =
		Number.parseFloat((event.target as HTMLInputElement).value) / 100;
	const raw = Math.round((voltage / 3.3) * 4095);
	emit("update", {
		...props.pin,
		analog: { voltage, raw },
	});
}

function handleMonitoringToggle() {
	const current = props.pin.monitoring ?? {
		enabled: false,
		pull: "none" as const,
	};
	emit("update", {
		...props.pin,
		monitoring: { ...current, enabled: !current.enabled },
	});
}

function handlePullChange(event: Event) {
	const pull = (event.target as HTMLSelectElement).value as
		| "up"
		| "down"
		| "none";
	emit("update", {
		...props.pin,
		monitoring: { ...props.pin.monitoring!, pull },
	});
}

function simulateInputChange() {
	emit("update", {
		...props.pin,
		digitalState: props.pin.digitalState === "high" ? "low" : "high",
	});
}

// Close on click outside
function onClickOutside(event: MouseEvent) {
	const target = event.target as Node;
	if (
		triggerRef.value &&
		!triggerRef.value.contains(target) &&
		floatingRef.value &&
		!floatingRef.value.contains(target)
	) {
		closePopover();
	}
}

watch(isOpen, (open) => {
	if (open) {
		document.addEventListener("mousedown", onClickOutside);
	} else {
		document.removeEventListener("mousedown", onClickOutside);
	}
});
</script>

<template>
	<!-- LED pin (center) -->
	<template v-if="isLed">
		<button
			ref="triggerRef"
			class="group flex flex-col items-center gap-1"
			:aria-label="`Pin ${pin.id} ${pin.name}`"
			@click="togglePopover"
		>
			<div
				class="w-3 h-3 rounded-full border-2 border-gray-500 transition-colors cursor-pointer group-hover:ring-2 ring-primary"
				:class="pinDotClasses"
			/>
			<span
				class="text-xs text-background font-mono group-hover:text-primary transition-colors"
			>
				{{ pin.name }}
			</span>
		</button>
	</template>

	<!-- Regular pin (left/right) -->
	<template v-else>
		<button
			ref="triggerRef"
			:disabled="!isInteractive"
			@click="togglePopover"
		>
			<div
				class="flex items-center gap-2 group"
				:class="
					side === 'left'
						? 'flex-row-reverse justify-end'
						: 'flex-row justify-start'
				"
			>
				<span
					class="text-xs text-white font-mono transition-colors w-5 text-center"
					:class="{ 'group-hover:text-primary': isInteractive }"
				>
					{{ pin.id }}
				</span>
				<div class="relative">
					<div
						class="w-3 h-3 rounded-full border-2 border-gray-500 transition-colors"
						:class="[
							pinDotClasses,
							isInteractive &&
								'cursor-pointer group-hover:ring-2 ring-primary',
						]"
						:style="
							pin.mode === 'pwm_output' && pin.pwm
								? {
										animationDuration: pwmAnimationDuration,
										opacity: pwmOpacity,
									}
								: {}
						"
					/>
					<!-- Analog voltage badge -->
					<span
						v-if="pin.mode === 'analog_input' && pin.analog"
						class="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-mono text-blue-300 whitespace-nowrap"
					>
						{{ pin.analog.voltage.toFixed(1) }}V
					</span>
				</div>
			</div>
		</button>
	</template>

	<!-- Popover -->
	<Teleport to="body">
		<div
			v-if="isOpen && isInteractive"
			ref="floatingRef"
			:style="floatingStyles"
			class="z-50 w-72 rounded-lg border bg-popover text-popover-foreground shadow-md p-4 space-y-3"
		>
			<!-- Header -->
			<div class="flex justify-between items-center">
				<h4 class="font-bold">{{ pin.name }}</h4>
				<span
					v-if="isGpio"
					class="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground"
				>
					GPIO {{ pin.gpio }}
				</span>
			</div>

			<!-- Capability badges -->
			<div
				v-if="capabilityBadges.length > 0"
				class="flex flex-wrap gap-1"
			>
				<span
					v-for="badge in capabilityBadges"
					:key="badge"
					class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
					:class="{
						'bg-yellow-100 text-yellow-800': badge === 'Digital',
						'bg-orange-100 text-orange-800': badge === 'PWM',
						'bg-blue-100 text-blue-800': badge === 'ADC',
						'bg-green-100 text-green-800': badge.startsWith('I2C'),
					}"
				>
					{{ badge }}
				</span>
			</div>

			<div class="h-px bg-border" />

			<!-- Mode selector (GPIO pins only, not LED) -->
			<div v-if="isGpio" class="space-y-1">
				<label
					:for="`mode-select-${pin.id}`"
					class="text-xs font-medium text-muted-foreground"
				>
					Mode
				</label>
				<select
					:id="`mode-select-${pin.id}`"
					:value="pin.mode"
					class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
					@change="handleModeChange"
				>
					<option
						v-for="mode in availableModes"
						:key="mode.value"
						:value="mode.value"
					>
						{{ mode.label }}
					</option>
				</select>
			</div>

			<div class="h-px bg-border" />

			<!-- Digital Output controls -->
			<div
				v-if="pin.mode === 'digital_output' || isLed"
				class="space-y-2"
			>
				<div class="flex items-center justify-between">
					<label
						:for="`state-switch-${pin.id}`"
						class="text-sm font-medium"
					>
						State: {{ pin.digitalState.toUpperCase() }}
					</label>
					<button
						:id="`state-switch-${pin.id}`"
						class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						role="switch"
						:aria-checked="pin.digitalState === 'high'"
						:aria-label="`Toggle pin ${pin.gpio || 'LED'} state`"
						:class="
							pin.digitalState === 'high'
								? 'bg-primary'
								: 'bg-input'
						"
						@click="handleDigitalStateToggle"
					>
						<span
							class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform"
							:class="
								pin.digitalState === 'high'
									? 'translate-x-5'
									: 'translate-x-0'
							"
						/>
					</button>
				</div>
			</div>

			<!-- Digital Input controls -->
			<div
				v-if="pin.mode === 'digital_input' && isGpio"
				class="space-y-3"
			>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium">
						Current: {{ pin.digitalState.toUpperCase() }}
					</span>
				</div>

				<!-- Monitoring -->
				<div class="space-y-2 rounded-md border p-2">
					<div class="flex items-center justify-between">
						<label
							:for="`monitor-${pin.id}`"
							class="text-xs font-medium"
						>
							Input Monitoring
						</label>
						<button
							:id="`monitor-${pin.id}`"
							class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							role="switch"
							:aria-checked="pin.monitoring?.enabled ?? false"
							:class="
								pin.monitoring?.enabled
									? 'bg-primary'
									: 'bg-input'
							"
							@click="handleMonitoringToggle"
						>
							<span
								class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform"
								:class="
									pin.monitoring?.enabled
										? 'translate-x-4'
										: 'translate-x-0'
								"
							/>
						</button>
					</div>

					<div
						v-if="pin.monitoring?.enabled"
						class="space-y-2"
					>
						<div class="flex items-center justify-between">
							<label
								:for="`pull-${pin.id}`"
								class="text-xs text-muted-foreground"
							>
								Pull Resistor
							</label>
							<select
								:id="`pull-${pin.id}`"
								:value="pin.monitoring?.pull ?? 'none'"
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

				<!-- Simulate input change -->
				<button
					class="w-full inline-flex items-center justify-center gap-1 rounded-md text-xs font-medium h-7 px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
					@click="simulateInputChange"
				>
					Simulate Input Change
				</button>
			</div>

			<!-- PWM Output controls -->
			<div
				v-if="pin.mode === 'pwm_output'"
				class="space-y-3"
			>
				<div class="space-y-1">
					<label
						:for="`pwm-freq-${pin.id}`"
						class="text-xs font-medium text-muted-foreground"
					>
						Frequency (Hz)
					</label>
					<input
						:id="`pwm-freq-${pin.id}`"
						type="number"
						min="1"
						max="100000"
						:value="pin.pwm?.frequency ?? 1000"
						class="w-full h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
						@change="handlePwmFrequencyChange"
					/>
				</div>

				<div class="space-y-1">
					<div class="flex justify-between">
						<label
							:for="`pwm-duty-${pin.id}`"
							class="text-xs font-medium text-muted-foreground"
						>
							Duty Cycle
						</label>
						<span class="text-xs text-muted-foreground">
							{{ Math.round((pin.pwm?.dutyCycle ?? 0) * 100) }}%
						</span>
					</div>
					<input
						:id="`pwm-duty-${pin.id}`"
						type="range"
						min="0"
						max="100"
						:value="Math.round((pin.pwm?.dutyCycle ?? 0) * 100)"
						class="w-full h-2 rounded-full appearance-none bg-input accent-primary cursor-pointer"
						@input="handlePwmDutyChange"
					/>
				</div>
			</div>

			<!-- Analog Input controls -->
			<div
				v-if="pin.mode === 'analog_input'"
				class="space-y-3"
			>
				<div class="space-y-1">
					<div class="flex justify-between">
						<label
							:for="`adc-voltage-${pin.id}`"
							class="text-xs font-medium text-muted-foreground"
						>
							Voltage
						</label>
						<span class="text-xs text-muted-foreground">
							{{ (pin.analog?.voltage ?? 0).toFixed(2) }}V
						</span>
					</div>
					<input
						:id="`adc-voltage-${pin.id}`"
						type="range"
						min="0"
						max="330"
						:value="Math.round((pin.analog?.voltage ?? 0) * 100)"
						class="w-full h-2 rounded-full appearance-none bg-input accent-blue-500 cursor-pointer"
						@input="handleVoltageChange"
					/>
				</div>

				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">Raw ADC Value:</span>
					<span class="font-mono font-medium">
						{{ pin.analog?.raw ?? 0 }}
					</span>
				</div>
			</div>

			<!-- Functions list -->
			<template v-if="pin.functions.length > 0 && !isLed">
				<div class="h-px bg-border" />
				<div class="space-y-1">
					<p class="text-xs font-medium text-muted-foreground">Alt Functions:</p>
					<div class="flex flex-wrap gap-1">
						<span
							v-for="func in pin.functions"
							:key="func"
							class="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium"
						>
							{{ func }}
						</span>
					</div>
				</div>
			</template>
		</div>
	</Teleport>
</template>
