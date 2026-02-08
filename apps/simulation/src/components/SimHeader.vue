<script setup lang="ts">
import { computed } from "vue";
import type { ConnectionStatus } from "@/composables/useDeviceConnection";

const props = withDefaults(
	defineProps<{
		selectedDevice: string;
		isDevMode?: boolean;
		connectionStatus?: ConnectionStatus;
		availableDevices?: string[];
	}>(),
	{
		isDevMode: false,
		connectionStatus: "disconnected",
		availableDevices: () => [],
	},
);

const emit = defineEmits<{
	deviceChange: [deviceId: string];
}>();

const fallbackDevices = ["PicoW-A", "PicoW-B", "PicoW-C"];

const devices = computed(() =>
	props.isDevMode && props.availableDevices.length > 0
		? props.availableDevices
		: fallbackDevices,
);

const statusColor = computed(() => {
	switch (props.connectionStatus) {
		case "connected":
			return "bg-green-500";
		case "connecting":
			return "bg-yellow-500 animate-pulse";
		default:
			return "bg-red-500";
	}
});
</script>

<template>
	<header class="flex items-center justify-between p-4 border-b bg-card">
		<div class="flex items-center gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="w-8 h-8 text-primary"
			>
				<path
					d="M5.5 13.5A3.5 3.5 0 0 1 2 10V8.5A3.5 3.5 0 0 1 5.5 5h1.052a3.5 3.5 0 0 1 3.203 2.22L11 11l-1.245 3.78a3.5 3.5 0 0 1-3.203 2.22H5.5Z"
				/>
				<path
					d="M18.5 13.5a3.5 3.5 0 0 0 3.5-3.5V8.5a3.5 3.5 0 0 0-3.5-3.5h-1.052a3.5 3.5 0 0 0-3.203 2.22L13 11l1.245 3.78a3.5 3.5 0 0 0 3.203 2.22H18.5Z"
				/>
			</svg>
			<h1 class="text-xl font-bold">DeviceSDK</h1>
			<span
				v-if="isDevMode"
				class="ml-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold text-primary border-primary/30 bg-primary/10"
			>
				<span :class="['inline-block w-2 h-2 rounded-full', statusColor]" />
				Dev Mode
			</span>
		</div>
		<div class="w-48">
			<select
				:value="selectedDevice"
				class="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
				@change="
					emit('deviceChange', ($event.target as HTMLSelectElement).value)
				"
			>
				<option v-for="device in devices" :key="device" :value="device">
					{{ device }}
				</option>
			</select>
		</div>
	</header>
</template>
