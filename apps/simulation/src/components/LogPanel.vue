<script setup lang="ts">
import type { LogEntry } from "@/lib/types";

const props = defineProps<{
	logs: LogEntry[];
}>();

const emit = defineEmits<{
	clear: [];
}>();

function badgeInfo(
	commandType?: string,
): { label: string; classes: string } | null {
	if (!commandType) return null;
	switch (commandType) {
		case "set_gpio_state":
			return { label: "GPIO", classes: "bg-yellow-100 text-yellow-800" };
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
		case "display_update":
			return { label: "Display", classes: "bg-indigo-100 text-indigo-800" };
		case "reboot":
			return { label: "System", classes: "bg-red-100 text-red-800" };
		default:
			return null;
	}
}
</script>

<template>
	<div class="flex flex-col h-full">
		<div class="flex items-center justify-between mb-2 px-1">
			<h2 class="text-lg font-semibold">Event Log</h2>
			<button
				v-if="logs.length > 0"
				class="inline-flex items-center gap-1 rounded-md text-xs font-medium h-6 px-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
				@click="emit('clear')"
			>
				Clear
			</button>
		</div>
		<div class="flex-grow rounded-md border p-4 bg-muted/20 overflow-y-auto">
			<div class="space-y-3">
				<p
					v-if="logs.length === 0"
					class="text-sm text-muted-foreground"
				>
					No events yet. Interact with a pin to start.
				</p>
				<div
					v-for="(log, index) in logs"
					:key="index"
					class="flex gap-3 text-sm animate-fade-in"
				>
					<span class="font-mono text-muted-foreground shrink-0 text-xs pt-0.5">{{
						log.timestamp
					}}</span>
					<div class="h-auto w-px bg-border shrink-0" />
					<div class="flex-1 flex items-start gap-2">
						<span
							v-if="badgeInfo(log.commandType)"
							class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
							:class="badgeInfo(log.commandType)!.classes"
						>
							{{ badgeInfo(log.commandType)!.label }}
						</span>
						<span class="text-foreground">{{ log.message }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
