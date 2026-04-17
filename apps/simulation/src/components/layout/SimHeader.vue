<script setup lang="ts">
import { computed } from "vue";
import { BOARDS } from "@/boards";
import { useSimulatorStore } from "@/stores/simulator";

const simulator = useSimulatorStore();

const fallbackDevices = ["sim-device-a", "sim-device-b", "sim-device-c"];

const devices = computed(() =>
	simulator.isDevMode && simulator.availableDevices.length > 0
		? simulator.availableDevices
		: fallbackDevices,
);

const statusColor = computed(() => {
	switch (simulator.connectionStatus) {
		case "connected":
			return "bg-green-500";
		case "connecting":
			return "bg-yellow-500 animate-pulse";
		default:
			return "bg-red-500";
	}
});

const boards = computed(() => Object.values(BOARDS));

const emit = defineEmits<{
	deviceChange: [deviceId: string];
}>();
</script>

<template>
	<header
		class="flex items-center justify-between h-14 px-4 border-b bg-card text-card-foreground"
	>
		<div class="flex items-center gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="w-7 h-7 text-primary"
			>
				<path
					d="M5.5 13.5A3.5 3.5 0 0 1 2 10V8.5A3.5 3.5 0 0 1 5.5 5h1.052a3.5 3.5 0 0 1 3.203 2.22L11 11l-1.245 3.78a3.5 3.5 0 0 1-3.203 2.22H5.5Z"
				/>
				<path
					d="M18.5 13.5a3.5 3.5 0 0 0 3.5-3.5V8.5a3.5 3.5 0 0 0-3.5-3.5h-1.052a3.5 3.5 0 0 0-3.203 2.22L13 11l1.245 3.78a3.5 3.5 0 0 0 3.203 2.22H18.5Z"
				/>
			</svg>
			<h1 class="text-lg font-bold">DeviceSDK Simulator</h1>
			<span
				v-if="simulator.isDevMode"
				class="ml-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-primary border-primary/30 bg-primary/10"
			>
				<span :class="['inline-block w-2 h-2 rounded-full', statusColor]" />
				Dev Mode
			</span>
		</div>

		<div class="flex items-center gap-2">
			<select
				:value="simulator.selectedBoardId"
				class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				@change="
					simulator.setBoard(($event.target as HTMLSelectElement).value)
				"
			>
				<option v-for="b in boards" :key="b.id" :value="b.id">
					{{ b.name }}
				</option>
			</select>

			<select
				:value="simulator.selectedDeviceId"
				class="h-9 w-44 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				@change="emit('deviceChange', ($event.target as HTMLSelectElement).value)"
			>
				<option v-for="d in devices" :key="d" :value="d">
					{{ d }}
				</option>
			</select>
		</div>
	</header>
</template>
