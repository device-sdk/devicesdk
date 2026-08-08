import { defineStore } from "pinia";
import { ref } from "vue";

export interface UartPortState {
	txPins: number[];
	rxPins: number[];
	baudRate?: number;
	/** Bytes injected by the user, waiting for the script's next `uart_read`. */
	receiveBuffer: string[];
}

const HEX_TOKEN_RE = /^[0-9A-Fa-f]{1,2}$/;

/**
 * Parse a user-typed string like `"41 42 FF FF FF"` (or `"0x41,0xFF"`) into
 * the `"0x.."` hex-string byte format used by `uart_*` payloads. Throws on
 * any malformed token.
 */
export function parseHexBytes(input: string): string[] {
	const tokens = input
		.split(/[\s,]+/)
		.map((t) => t.trim().replace(/^0x/i, ""))
		.filter((t) => t.length > 0);
	for (const token of tokens) {
		if (!HEX_TOKEN_RE.test(token)) {
			throw new Error(
				`Invalid hex byte "${token}" - expected 1-2 hex digits per byte`,
			);
		}
	}
	return tokens.map((t) => `0x${t.toUpperCase()}`);
}

/**
 * Simulated UART ports. Injected bytes sit in each port's receive buffer and
 * are returned to the script by the next `uart_read` - mirroring a real
 * request/response exchange (e.g. a Nextion `get` reply or a touch frame).
 */
export const useUartStore = defineStore("uart", () => {
	const ports = ref<Record<number, UartPortState>>({});

	function ensurePort(port: number): UartPortState {
		ports.value[port] ??= {
			txPins: [],
			rxPins: [],
			receiveBuffer: [],
		};
		return ports.value[port];
	}

	function configure(
		port: number,
		txPin: number,
		rxPin: number,
		baudRate: number,
	) {
		const state = ensurePort(port);
		state.txPins = [txPin];
		state.rxPins = [rxPin];
		state.baudRate = baudRate;
	}

	function injectBytes(port: number, bytes: string[]) {
		ensurePort(port).receiveBuffer.push(...bytes);
	}

	function takeRead(
		port: number,
		bytesToRead: number,
	): { data: string[]; bytesRead: number } {
		const state = ports.value[port];
		if (!state) return { data: [], bytesRead: 0 };
		const data = state.receiveBuffer.splice(0, bytesToRead);
		return { data, bytesRead: data.length };
	}

	function bufferedCount(port: number): number {
		return ports.value[port]?.receiveBuffer.length ?? 0;
	}

	function clearBuffers() {
		for (const state of Object.values(ports.value)) {
			state.receiveBuffer = [];
		}
	}

	function reset() {
		ports.value = {};
	}

	return {
		ports,
		configure,
		injectBytes,
		takeRead,
		bufferedCount,
		clearBuffers,
		reset,
	};
});
