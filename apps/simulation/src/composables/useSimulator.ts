import type { DeviceCommand } from "@devicesdk/core";
import { ref } from "vue";
import { PIN_CAPABILITIES } from "@/lib/pinCapabilities";
import { pinsData } from "@/lib/pins";
import type { ConnectedSensor, LogEntry, PinType } from "@/lib/types";

export function useSimulator() {
	const selectedDevice = ref("PicoW-A");
	const pins = ref<PinType[]>(structuredClone(pinsData));
	const logs = ref<LogEntry[]>([]);
	const connectedSensors = ref<ConnectedSensor[]>([]);

	function addLog(message: string, commandType?: DeviceCommand["type"]) {
		logs.value.unshift({
			timestamp: new Date().toLocaleTimeString(),
			message,
			commandType,
		});
	}

	function clearLogs() {
		logs.value = [];
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
		const gpio = updatedPin.gpio;

		// Validate mode change against capabilities
		if (gpio !== null && oldPin.mode !== updatedPin.mode) {
			const caps = PIN_CAPABILITIES[gpio];
			if (caps) {
				if (updatedPin.mode === "analog_input" && !caps.adc) {
					addLog(
						`Error: GP${gpio} does not support ADC. Only GPIO 26, 27, 28 have ADC capability.`,
					);
					return;
				}
			}
		}

		// Log mode changes
		if (oldPin.mode !== updatedPin.mode) {
			const label =
				updatedPin.gpio !== null ? `GP${updatedPin.gpio}` : updatedPin.name;

			if (updatedPin.mode === "pwm_output") {
				const freq = updatedPin.pwm?.frequency ?? 1000;
				const duty = updatedPin.pwm?.dutyCycle ?? 0;
				addLog(
					`${label} configured as PWM output (${freq} Hz, ${Math.round(duty * 100)}% duty)`,
					"set_pwm_state",
				);
			} else if (updatedPin.mode === "analog_input") {
				addLog(`${label} configured as analog input (ADC)`, "get_pin_state");
			} else if (updatedPin.mode === "digital_input") {
				addLog(`${label} configured as digital input`);
			} else if (updatedPin.mode === "digital_output") {
				addLog(`${label} configured as digital output`);
			}
		}

		// Log state changes per mode
		if (oldPin.mode === updatedPin.mode || oldPin.mode !== updatedPin.mode) {
			const label =
				updatedPin.gpio !== null ? `GP${updatedPin.gpio}` : updatedPin.name;

			// Digital state changes
			if (
				updatedPin.mode === "digital_output" &&
				oldPin.digitalState !== updatedPin.digitalState &&
				oldPin.mode === updatedPin.mode
			) {
				addLog(
					`${label} → ${updatedPin.digitalState.toUpperCase()}`,
					"set_gpio_state",
				);
			}

			// PWM config changes
			if (
				updatedPin.mode === "pwm_output" &&
				oldPin.mode === "pwm_output" &&
				updatedPin.pwm &&
				oldPin.pwm &&
				(oldPin.pwm.frequency !== updatedPin.pwm.frequency ||
					oldPin.pwm.dutyCycle !== updatedPin.pwm.dutyCycle)
			) {
				addLog(
					`${label} PWM updated: ${updatedPin.pwm.frequency} Hz, ${Math.round(updatedPin.pwm.dutyCycle * 100)}% duty`,
					"set_pwm_state",
				);
			}

			// Analog reading changes
			if (
				updatedPin.mode === "analog_input" &&
				oldPin.mode === "analog_input" &&
				updatedPin.analog &&
				oldPin.analog &&
				oldPin.analog.voltage !== updatedPin.analog.voltage
			) {
				addLog(
					`${label} ADC read: ${updatedPin.analog.voltage.toFixed(2)}V (raw: ${updatedPin.analog.raw})`,
					"get_pin_state",
				);
			}

			// Monitoring config changes
			if (
				updatedPin.mode === "digital_input" &&
				oldPin.mode === "digital_input" &&
				updatedPin.monitoring &&
				(oldPin.monitoring?.enabled !== updatedPin.monitoring.enabled ||
					oldPin.monitoring?.pull !== updatedPin.monitoring.pull)
			) {
				if (updatedPin.monitoring.enabled) {
					addLog(
						`${label} input monitoring enabled (pull: ${updatedPin.monitoring.pull})`,
						"configure_gpio_input_monitoring",
					);
				} else {
					addLog(
						`${label} input monitoring disabled`,
						"configure_gpio_input_monitoring",
					);
				}
			}

			// Simulated input change (digital_input state toggle)
			if (
				updatedPin.mode === "digital_input" &&
				oldPin.mode === "digital_input" &&
				oldPin.digitalState !== updatedPin.digitalState
			) {
				addLog(
					`${label} input changed → ${updatedPin.digitalState.toUpperCase()}`,
					"configure_gpio_input_monitoring",
				);
			}
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
		const pinList = Object.entries(sensor.pins)
			.map(([role, gpio]) => `${role}: GP${gpio}`)
			.join(", ");
		addLog(`Connected ${sensor.type} (${pinList})`, "i2c_configure");
	}

	function disconnectSensor(sensorType: string) {
		connectedSensors.value = connectedSensors.value.filter(
			(s) => s.type !== sensorType,
		);
		addLog(`Disconnected ${sensorType}`);
	}

	return {
		selectedDevice,
		pins,
		logs,
		connectedSensors,
		addLog,
		clearLogs,
		changeDevice,
		updatePin,
		connectSensor,
		disconnectSensor,
	};
}
