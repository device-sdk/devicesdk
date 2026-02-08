<script setup lang="ts">
defineProps<{
	selectedDevice: string;
}>();

const emit = defineEmits<{
	deviceChange: [deviceId: string];
}>();

const devices = ["PicoW-A", "PicoW-B", "PicoW-C"];
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
