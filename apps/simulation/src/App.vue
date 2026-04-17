<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import InspectorPanel from "@/components/layout/InspectorPanel.vue";
import LogDrawer from "@/components/layout/LogDrawer.vue";
import PalettePanel from "@/components/layout/PalettePanel.vue";
import SimHeader from "@/components/layout/SimHeader.vue";
import StagePanel from "@/components/layout/StagePanel.vue";
import TimelineDock from "@/components/layout/TimelineDock.vue";
import { useDeviceConnection } from "@/composables/useDeviceConnection";
import { useSimulator } from "@/composables/useSimulator";
import { usePinStateStore } from "@/stores/pinState";
import { useSimulatorStore } from "@/stores/simulator";

const simulator = useSimulatorStore();
const pinState = usePinStateStore();

const { handleDeviceCommand } = useSimulator();
const {
	status: connectionStatus,
	isDevMode,
	availableDevices,
	detectDevMode,
	connect,
	sendEvent,
} = useDeviceConnection();

function handleDeviceChange(deviceId: string) {
	simulator.setDevice(deviceId);
	if (simulator.isDevMode) {
		connect(deviceId, handleDeviceCommand);
	}
}

watch(connectionStatus, (status) => simulator.setConnectionStatus(status));
watch(isDevMode, (dev) => {
	simulator.isDevMode = dev;
});
watch(availableDevices, (devices) => {
	simulator.availableDevices = [...devices];
});

// Forward digital-input pin state changes to the firmware when monitoring is enabled.
const stopDigitalWatch = pinState.onDigitalChange((gpio, _old, next) => {
	if (simulator.connectionStatus !== "connected") return;
	const s = pinState.get(gpio);
	if (s.mode !== "digital_input") return;
	if (!s.monitoring?.enabled) return;
	sendEvent({
		type: "gpio_state_changed",
		id: crypto.randomUUID(),
		payload: { pin: gpio, state: next },
	});
});

onUnmounted(() => stopDigitalWatch());

onMounted(async () => {
	const devMode = await detectDevMode();
	simulator.isDevMode = devMode;
	simulator.availableDevices = [...availableDevices.value];
	if (devMode && availableDevices.value.length > 0) {
		const first = availableDevices.value[0];
		simulator.setDevice(first);
		connect(first, handleDeviceCommand);
		simulator.addLog(`Dev mode: connecting to ${first}...`);
	}
});
</script>

<template>
	<div class="flex flex-col h-screen bg-background text-foreground">
		<SimHeader @device-change="handleDeviceChange" />
		<main
			class="flex-1 grid overflow-hidden"
			style="grid-template-columns: 240px 1fr 320px"
		>
			<PalettePanel />
			<StagePanel />
			<InspectorPanel />
		</main>
		<TimelineDock />
		<LogDrawer />
	</div>
</template>
