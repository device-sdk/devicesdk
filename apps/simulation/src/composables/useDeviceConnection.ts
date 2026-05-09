import type { DeviceCommand, DeviceResponse } from "@devicesdk/core";
import { onUnmounted, ref } from "vue";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export function useDeviceConnection() {
	const status = ref<ConnectionStatus>("disconnected");
	const isDevMode = ref(false);
	const availableDevices = ref<string[]>([]);
	const reconnecting = ref(false);

	let ws: WebSocket | null = null;
	let commandHandler: ((cmd: DeviceCommand) => DeviceResponse | null) | null =
		null;

	// Reconnect state — set when `connect()` is called, used by `onclose` to
	// re-establish the socket after the local dev worker restarts. Cleared on
	// explicit `disconnect()` so a manual disconnect doesn't loop forever.
	let activeDeviceId: string | null = null;
	let reconnectDelayMs = RECONNECT_INITIAL_MS;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let intentionallyClosed = false;

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

	function openSocket() {
		if (!activeDeviceId || !commandHandler) return;
		status.value = "connecting";

		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		ws = new WebSocket(
			`${protocol}//${window.location.host}/ws/${activeDeviceId}`,
		);

		ws.onopen = () => {
			status.value = "connected";
			reconnecting.value = false;
			reconnectDelayMs = RECONNECT_INITIAL_MS;
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
			ws = null;
			if (intentionallyClosed || !activeDeviceId || !commandHandler) return;

			// Local dev worker restart: schedule a reconnect with exponential
			// backoff (1s → 30s) so file edits don't strand the simulator UI.
			reconnecting.value = true;
			const delay = reconnectDelayMs;
			reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_MS);
			reconnectTimer = setTimeout(() => {
				reconnectTimer = null;
				openSocket();
			}, delay);
		};

		ws.onerror = () => {
			// `error` typically precedes `close`; let close drive reconnect.
		};
	}

	function connect(
		deviceId: string,
		onCommand: (cmd: DeviceCommand) => DeviceResponse | null,
	) {
		disconnect();
		intentionallyClosed = false;
		activeDeviceId = deviceId;
		commandHandler = onCommand;
		reconnectDelayMs = RECONNECT_INITIAL_MS;
		openSocket();
	}

	function disconnect() {
		intentionallyClosed = true;
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
		reconnecting.value = false;
		if (ws) {
			ws.close();
			ws = null;
		}
		status.value = "disconnected";
		commandHandler = null;
		activeDeviceId = null;
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
		reconnecting,
		detectDevMode,
		connect,
		disconnect,
		sendEvent,
	};
}
