import type { DeviceCommand, DeviceResponse } from "@devicesdk/core";
import { onUnmounted, ref } from "vue";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export function useDeviceConnection() {
	const status = ref<ConnectionStatus>("disconnected");
	const isDevMode = ref(false);
	const availableDevices = ref<string[]>([]);

	let ws: WebSocket | null = null;
	let commandHandler: ((cmd: DeviceCommand) => DeviceResponse | null) | null =
		null;

	async function detectDevMode(): Promise<boolean> {
		try {
			const resp = await fetch("/api/devices");
			if (resp.ok) {
				const data = await resp.json();
				availableDevices.value = data.devices || [];
				isDevMode.value = true;
				return true;
			}
		} catch {
			// Not in dev mode
		}
		isDevMode.value = false;
		return false;
	}

	function connect(
		deviceId: string,
		onCommand: (cmd: DeviceCommand) => DeviceResponse | null,
	) {
		disconnect();
		commandHandler = onCommand;
		status.value = "connecting";

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		ws = new WebSocket(`${protocol}//${window.location.host}/ws/${deviceId}`);

		ws.onopen = () => {
			status.value = "connected";
			// Send device_connected message like real firmware
			try {
				ws?.send(
					JSON.stringify({
						type: "device_connected",
						id: "init",
					}),
				);
			} catch {
				status.value = "disconnected";
			}
		};

		ws.onmessage = (event) => {
			try {
				const command = JSON.parse(event.data) as DeviceCommand;
				if (commandHandler) {
					const response = commandHandler(command);
					if (response && ws?.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify(response));
					}
				}
			} catch (error) {
				console.error("Failed to handle command:", error);
			}
		};

		ws.onclose = () => {
			status.value = "disconnected";
		};

		ws.onerror = () => {
			status.value = "disconnected";
		};
	}

	function disconnect() {
		if (ws) {
			ws.close();
			ws = null;
		}
		status.value = "disconnected";
		commandHandler = null;
	}

	function sendEvent(response: DeviceResponse) {
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(response));
		}
	}

	onUnmounted(() => {
		disconnect();
	});

	return {
		status,
		isDevMode,
		availableDevices,
		detectDevMode,
		connect,
		disconnect,
		sendEvent,
	};
}
