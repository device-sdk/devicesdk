<script setup lang="ts">
import SimHeader from "@/components/SimHeader.vue";
import LogPanel from "@/components/LogPanel.vue";
import VirtualSensorConnector from "@/components/VirtualSensorConnector.vue";
import PicoBoard from "@/components/pico/PicoBoard.vue";
import { useSimulator } from "@/composables/useSimulator";

const {
	selectedDevice,
	pins,
	logs,
	connectedSensors,
	addLog,
	changeDevice,
	updatePin,
	connectSensor,
	disconnectSensor,
} = useSimulator();
</script>

<template>
	<div class="flex flex-col h-screen bg-background">
		<SimHeader
			:selected-device="selectedDevice"
			@device-change="changeDevice"
		/>
		<main
			class="flex-grow grid md:grid-cols-2 gap-8 p-4 md:p-8 overflow-hidden"
		>
			<div class="flex items-center justify-center h-full overflow-hidden">
				<PicoBoard :pins="pins" @pin-update="updatePin" />
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
						<LogPanel :logs="logs" />
					</div>
				</div>
			</div>
		</main>
	</div>
</template>
