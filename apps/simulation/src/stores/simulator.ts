import type { DeviceCommand } from "@devicesdk/core";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { DEFAULT_BOARD_ID, getBoard } from "@/boards";
import type { LogEntry } from "@/lib/types";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

const MAX_LOGS = 500;

export const useSimulatorStore = defineStore("simulator", () => {
	const selectedBoardId = ref(DEFAULT_BOARD_ID);
	const selectedDeviceId = ref("");
	const connectionStatus = ref<ConnectionStatus>("disconnected");
	const isDevMode = ref(false);
	const availableDevices = ref<string[]>([]);
	const logs = ref<LogEntry[]>([]);

	const board = computed(() => getBoard(selectedBoardId.value));

	function addLog(message: string, commandType?: DeviceCommand["type"]) {
		logs.value.unshift({
			timestamp: new Date().toLocaleTimeString(),
			message,
			commandType,
		});
		if (logs.value.length > MAX_LOGS) logs.value.length = MAX_LOGS;
	}

	function clearLogs() {
		logs.value = [];
	}

	function setBoard(id: string) {
		selectedBoardId.value = id;
	}

	function setDevice(id: string) {
		selectedDeviceId.value = id;
	}

	function setConnectionStatus(status: ConnectionStatus) {
		connectionStatus.value = status;
	}

	return {
		selectedBoardId,
		selectedDeviceId,
		connectionStatus,
		isDevMode,
		availableDevices,
		logs,
		board,
		addLog,
		clearLogs,
		setBoard,
		setDevice,
		setConnectionStatus,
	};
});
