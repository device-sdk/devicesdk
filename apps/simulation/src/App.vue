<script setup lang="ts">
import { onMounted, watch } from "vue";
import SimHeader from "@/components/SimHeader.vue";
import LogPanel from "@/components/LogPanel.vue";
import VirtualSensorConnector from "@/components/VirtualSensorConnector.vue";
import PicoBoard from "@/components/pico/PicoBoard.vue";
import OledDisplay from "@/components/OledDisplay.vue";
import { useSimulator } from "@/composables/useSimulator";
import { useDeviceConnection } from "@/composables/useDeviceConnection";

const {
	selectedDevice,
	pins,
	logs,
	connectedSensors,
	latestDisplayUpdate,
	addLog,
	clearLogs,
	changeDevice,
	updatePin,
	connectSensor,
	disconnectSensor,
	handleDeviceCommand,
} = useSimulator();

const {
	status: connectionStatus,
	isDevMode,
	availableDevices,
	detectDevMode,
	connect,
	disconnect,
	sendEvent,
} = useDeviceConnection();

function hasOledConnected(): boolean {
	return connectedSensors.value.some((s) => s.type === "SSD1306 OLED");
}

function handleDeviceChange(deviceId: string) {
	changeDevice(deviceId);
	if (isDevMode.value) {
		connect(deviceId, handleDeviceCommand);
	}
}

// When a pin in digital_input mode changes (user interaction), send event to user code
watch(
	pins,
	(newPins, oldPins) => {
		if (!isDevMode.value || connectionStatus.value !== "connected") return;
		if (!oldPins) return;

		for (let i = 0; i < newPins.length; i++) {
			const newPin = newPins[i];
			const oldPin = oldPins[i];
			if (
				newPin.mode === "digital_input" &&
				oldPin.mode === "digital_input" &&
				newPin.gpio !== null &&
				newPin.monitoring?.enabled &&
				oldPin.digitalState !== newPin.digitalState
			) {
				sendEvent({
					type: "gpio_state_changed",
					id: crypto.randomUUID(),
					payload: {
						pin: newPin.gpio,
						state: newPin.digitalState,
					},
				});
			}
		}
	},
	{ deep: true },
);

onMounted(async () => {
	const devMode = await detectDevMode();
	if (devMode && availableDevices.value.length > 0) {
		const firstDevice = availableDevices.value[0];
		selectedDevice.value = firstDevice;
		connect(firstDevice, handleDeviceCommand);
		addLog(`Dev mode: connecting to ${firstDevice}...`);
	}
});
</script>

<template>
	<div class="flex flex-col h-screen bg-background">
		<SimHeader
			:selected-device="selectedDevice"
			:is-dev-mode="isDevMode"
			:connection-status="connectionStatus"
			:available-devices="availableDevices"
			@device-change="handleDeviceChange"
		/>
		<main
			class="flex-grow grid md:grid-cols-2 gap-8 p-4 md:p-8 overflow-hidden"
		>
			<div class="flex flex-col items-center justify-center h-full overflow-hidden gap-4">
				<PicoBoard :pins="pins" @pin-update="updatePin" />
				<OledDisplay
					v-if="hasOledConnected() || latestDisplayUpdate"
					:display-command="latestDisplayUpdate"
					@log="addLog"
				/>
			</div>
			<div class="flex flex-col gap-8 h-full overflow-hidden">
				<VirtualSensorConnector
					:pins="pins"
					:connected-sensors="connectedSensors"
					@connect-sensor="connectSensor"
					@disconnect-sensor="disconnectSensor"
					@log="addLog"
				/>
				<div
					class="flex-grow flex flex-col h-full overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm"
				>
					<div class="p-4 flex-grow overflow-hidden">
						<LogPanel :logs="logs" @clear="clearLogs" />
					</div>
				</div>
			</div>
		</main>
	</div>
</template>
