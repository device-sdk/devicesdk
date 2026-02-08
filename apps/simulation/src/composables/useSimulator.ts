import { ref } from "vue";
import { pinsData } from "@/lib/pins";
import type { ConnectedSensor, LogEntry, PinType } from "@/lib/types";

export function useSimulator() {
	const selectedDevice = ref("PicoW-A");
	const pins = ref<PinType[]>(structuredClone(pinsData));
	const logs = ref<LogEntry[]>([]);
	const connectedSensors = ref<ConnectedSensor[]>([]);

	function addLog(message: string) {
		logs.value.unshift({
			timestamp: new Date().toLocaleTimeString(),
			message,
		});
	}

	function changeDevice(deviceId: string) {
		selectedDevice.value = deviceId;
		pins.value = structuredClone(pinsData);
		logs.value = [];
		connectedSensors.value = [];
		addLog(`Switched to device: ${deviceId}. Board reset.`);
	}

	function updatePin(updatedPin: PinType) {
		const index = pins.value.findIndex((p) => p.id === updatedPin.id);
		if (index === -1) return;

		const oldPin = pins.value[index];

		if (oldPin.mode !== updatedPin.mode) {
			addLog(
				`Pin ${updatedPin.name} (GPIO ${updatedPin.gpio}) mode set to ${updatedPin.mode}.`,
			);
		}
		if (oldPin.state !== updatedPin.state) {
			addLog(
				`Pin ${updatedPin.name} (GPIO ${updatedPin.gpio}) state set to ${updatedPin.state}.`,
			);
		}

		pins.value[index] = updatedPin;
	}

	function connectSensor(sensor: ConnectedSensor) {
		if (connectedSensors.value.some((s) => s.type === sensor.type)) {
			addLog(
				`Sensor ${sensor.type} is already connected. Disconnect it first.`,
			);
			return;
		}
		connectedSensors.value.push(sensor);
		addLog(
			`Connected ${sensor.type} to pins: ${Object.values(sensor.pins).join(", ")}.`,
		);
	}

	function disconnectSensor(sensorType: string) {
		connectedSensors.value = connectedSensors.value.filter(
			(s) => s.type !== sensorType,
		);
		addLog(`Disconnected ${sensorType}.`);
	}

	return {
		selectedDevice,
		pins,
		logs,
		connectedSensors,
		addLog,
		changeDevice,
		updatePin,
		connectSensor,
		disconnectSensor,
	};
}
