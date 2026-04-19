<script setup lang="ts">
import { computed } from "vue";
import { findPinByGpio } from "@/boards";
import { usePinStateStore } from "@/stores/pinState";
import { useSimulatorStore } from "@/stores/simulator";

const pinState = usePinStateStore();
const simulator = useSimulatorStore();

interface PinRow {
	gpio: number;
	label: string;
	onBoard: boolean;
	mode: string;
	state: string;
	detail?: string;
	canSimulate: boolean;
}

const rows = computed<PinRow[]>(() => {
	const entries = Object.entries(pinState.states)
		.map(([k, v]) => [Number(k), v] as const)
		.sort((a, b) => a[0] - b[0]);
	return entries.map(([gpio, s]) => {
		const pinDef = findPinByGpio(simulator.board, gpio);
		const modeLabel =
			s.mode === "digital_input"
				? "INPUT"
				: s.mode === "digital_output"
					? "OUTPUT"
					: s.mode === "pwm_output"
						? "PWM"
						: "ADC";
		let state = s.digitalState.toUpperCase();
		let detail: string | undefined;
		if (s.mode === "pwm_output" && s.pwm) {
			state = `${Math.round(s.pwm.dutyCycle * 100)}% @ ${s.pwm.frequency}Hz`;
		} else if (s.mode === "analog_input" && s.analog) {
			state = `${s.analog.voltage.toFixed(2)}V`;
			detail = `raw ${s.analog.raw}`;
		} else if (s.mode === "digital_input" && s.monitoring?.enabled) {
			detail = `pull-${s.monitoring.pull}`;
		}
		return {
			gpio,
			label: pinDef?.label ?? `GPIO ${gpio}`,
			onBoard: !!pinDef,
			mode: modeLabel,
			state,
			detail,
			canSimulate:
				s.mode === "digital_input" && (s.monitoring?.enabled ?? false),
		};
	});
});

function toggleInput(gpio: number) {
	const s = pinState.get(gpio);
	const next = s.digitalState === "high" ? "low" : "high";
	pinState.setDigital(gpio, next);
	simulator.addLog(
		`GPIO ${gpio} input injected → ${next.toUpperCase()}`,
		"configure_gpio_input_monitoring",
	);
}

function clickInput(gpio: number) {
	const s = pinState.get(gpio);
	// Pull-up wiring → idle HIGH, press drags LOW (and vice versa).
	const idle: "high" | "low" = s.monitoring?.pull === "down" ? "low" : "high";
	const press: "high" | "low" = idle === "high" ? "low" : "high";
	pinState.setDigital(gpio, press);
	simulator.addLog(
		`GPIO ${gpio} PRESS → ${press.toUpperCase()}`,
		"configure_gpio_input_monitoring",
	);
	setTimeout(() => {
		pinState.setDigital(gpio, idle);
		simulator.addLog(
			`GPIO ${gpio} RELEASE → ${idle.toUpperCase()}`,
			"configure_gpio_input_monitoring",
		);
	}, 140);
}

function modeBadgeClass(mode: string): string {
	switch (mode) {
		case "INPUT":
			return "bg-yellow-100 text-yellow-800";
		case "OUTPUT":
			return "bg-amber-100 text-amber-800";
		case "PWM":
			return "bg-purple-100 text-purple-800";
		case "ADC":
			return "bg-blue-100 text-blue-800";
		default:
			return "bg-muted text-muted-foreground";
	}
}
</script>

<template>
	<section class="space-y-2">
		<div class="flex items-center justify-between">
			<h3 class="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
				Script Pins
			</h3>
			<span class="text-[10px] text-muted-foreground">
				{{ rows.length }} touched
			</span>
		</div>
		<p
			v-if="rows.length === 0"
			class="text-[11px] text-muted-foreground italic text-center py-2"
		>
			No pins touched yet. The device script will populate this as it runs.
		</p>
		<div
			v-for="row in rows"
			:key="row.gpio"
			class="rounded-md border p-2 space-y-1"
			:class="
				row.onBoard
					? 'border-border bg-background'
					: 'border-amber-400/40 bg-amber-50/30'
			"
		>
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2 min-w-0">
					<span class="font-mono text-xs font-semibold truncate">
						{{ row.label }}
					</span>
					<span
						class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
						:class="modeBadgeClass(row.mode)"
					>
						{{ row.mode }}
					</span>
					<span
						v-if="!row.onBoard"
						class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium bg-amber-100 text-amber-900"
						title="Pin not exposed on the current board — driven virtually"
					>
						off-board
					</span>
				</div>
				<span class="font-mono text-xs shrink-0">{{ row.state }}</span>
			</div>
			<div
				v-if="row.detail"
				class="text-[10px] text-muted-foreground font-mono"
			>
				{{ row.detail }}
			</div>
			<div
				v-if="row.canSimulate"
				class="grid grid-cols-2 gap-1 pt-1"
			>
				<button
					type="button"
					class="h-6 rounded text-[10px] font-medium border hover:bg-accent/40 transition-colors"
					@click="toggleInput(row.gpio)"
				>
					Toggle
				</button>
				<button
					type="button"
					class="h-6 rounded text-[10px] font-medium border hover:bg-accent/40 transition-colors"
					@click="clickInput(row.gpio)"
				>
					Pulse
				</button>
			</div>
		</div>
	</section>
</template>
