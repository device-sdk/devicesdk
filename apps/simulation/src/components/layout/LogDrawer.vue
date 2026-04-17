<script setup lang="ts">
import type { DeviceCommand } from "@devicesdk/core";
import { ref } from "vue";
import { useSimulatorStore } from "@/stores/simulator";

const simulator = useSimulatorStore();
const collapsed = ref(false);

function badgeInfo(
	commandType?: DeviceCommand["type"],
): { label: string; classes: string } | null {
	if (!commandType) return null;
	switch (commandType) {
		case "set_gpio_state":
		case "configure_gpio_input_monitoring":
			return { label: "GPIO", classes: "bg-yellow-100 text-yellow-800" };
		case "set_pwm_state":
			return { label: "PWM", classes: "bg-purple-100 text-purple-800" };
		case "get_pin_state":
			return { label: "ADC", classes: "bg-blue-100 text-blue-800" };
		case "i2c_configure":
		case "i2c_scan":
		case "i2c_write":
		case "i2c_read":
		case "i2c_batch_write":
			return { label: "I2C", classes: "bg-green-100 text-green-800" };
		case "spi_configure":
		case "spi_transfer":
		case "spi_read":
		case "spi_write":
			return { label: "SPI", classes: "bg-teal-100 text-teal-800" };
		case "uart_configure":
		case "uart_read":
		case "uart_write":
			return { label: "UART", classes: "bg-cyan-100 text-cyan-800" };
		case "pio_ws2812_configure":
		case "pio_ws2812_update":
			return { label: "LED", classes: "bg-pink-100 text-pink-800" };
		case "display_update":
			return { label: "Display", classes: "bg-indigo-100 text-indigo-800" };
		case "reboot":
			return { label: "System", classes: "bg-red-100 text-red-800" };
		case "get_temperature":
			return { label: "Temp", classes: "bg-orange-100 text-orange-800" };
		case "watchdog_configure":
		case "watchdog_feed":
			return { label: "WDT", classes: "bg-amber-100 text-amber-800" };
		default:
			return null;
	}
}
</script>

<template>
	<section
		class="flex flex-col bg-card text-card-foreground border-t"
		:class="collapsed ? 'h-10' : 'h-48'"
	>
		<header class="flex items-center justify-between px-3 h-10 border-b">
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="text-xs text-muted-foreground hover:text-foreground"
					:aria-label="collapsed ? 'Expand log drawer' : 'Collapse log drawer'"
					@click="collapsed = !collapsed"
				>
					{{ collapsed ? "▸" : "▾" }}
				</button>
				<h2 class="text-sm font-semibold">Event Log</h2>
				<span class="text-[10px] text-muted-foreground">
					{{ simulator.logs.length }}
				</span>
			</div>
			<button
				v-if="simulator.logs.length > 0 && !collapsed"
				type="button"
				class="inline-flex items-center gap-1 rounded-md text-xs font-medium h-6 px-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
				@click="simulator.clearLogs"
			>
				Clear
			</button>
		</header>
		<div v-if="!collapsed" class="flex-1 overflow-y-auto px-3 py-2">
			<p
				v-if="simulator.logs.length === 0"
				class="text-xs text-muted-foreground italic"
			>
				No events yet. Interact with a pin to start.
			</p>
			<div
				v-for="(log, index) in simulator.logs"
				:key="index"
				class="flex items-start gap-2 text-xs py-0.5 border-b border-border/30 last:border-0"
			>
				<span class="font-mono text-muted-foreground shrink-0">{{ log.timestamp }}</span>
				<span
					v-if="badgeInfo(log.commandType)"
					class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold shrink-0"
					:class="badgeInfo(log.commandType)!.classes"
				>
					{{ badgeInfo(log.commandType)!.label }}
				</span>
				<span class="text-foreground">{{ log.message }}</span>
			</div>
		</div>
	</section>
</template>
