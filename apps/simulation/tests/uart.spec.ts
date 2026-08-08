import type { DeviceCommand } from "@devicesdk/core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useSimulator } from "../src/composables/useSimulator";
import { parseHexBytes, useUartStore } from "../src/stores/uart";

function command(
	type: string,
	payload: Record<string, unknown>,
): DeviceCommand {
	return { id: "msg-1", type, payload } as DeviceCommand;
}

describe("parseHexBytes", () => {
	it("parses space-separated hex tokens and normalizes to 0x format", () => {
		expect(parseHexBytes("41 42 FF FF FF")).toEqual([
			"0x41",
			"0x42",
			"0xFF",
			"0xFF",
			"0xFF",
		]);
	});

	it("accepts 0x prefixes, commas, and lowercase", () => {
		expect(parseHexBytes("0x41,0xff,7")).toEqual(["0x41", "0xFF", "0x07"]);
	});

	it("returns an empty array for empty input", () => {
		expect(parseHexBytes("")).toEqual([]);
		expect(parseHexBytes("   ")).toEqual([]);
	});

	it("rejects malformed tokens with a clear error", () => {
		expect(() => parseHexBytes("41 GG")).toThrow('Invalid hex byte "GG"');
		expect(() => parseHexBytes("123")).toThrow("Invalid hex byte");
	});
});

describe("useUartStore", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("returns injected bytes in FIFO order", () => {
		const uart = useUartStore();
		uart.injectBytes(1, ["0x41", "0x42"]);
		uart.injectBytes(1, ["0x43"]);

		expect(uart.takeRead(1, 2)).toEqual({
			data: ["0x41", "0x42"],
			bytesRead: 2,
		});
		expect(uart.takeRead(1, 2)).toEqual({ data: ["0x43"], bytesRead: 1 });
	});

	it("returns nothing on unconfigured ports", () => {
		const uart = useUartStore();
		expect(uart.takeRead(3, 4)).toEqual({ data: [], bytesRead: 0 });
		expect(uart.bufferedCount(3)).toBe(0);
	});

	it("caps the buffer so a runaway paste cannot grow unboundedly", () => {
		const uart = useUartStore();
		const bytes = Array.from({ length: 5000 }, () => "0x41");
		uart.injectBytes(0, bytes);
		expect(uart.bufferedCount(0)).toBe(4096);
		// FIFO order preserved up to the cap: oldest bytes survive.
		expect(uart.takeRead(0, 1)).toEqual({ data: ["0x41"], bytesRead: 1 });
	});

	it("clearBuffers empties every port; reset drops all state", () => {
		const uart = useUartStore();
		uart.injectBytes(0, ["0x41"]);
		uart.injectBytes(1, ["0x42"]);
		uart.clearBuffers();
		expect(uart.bufferedCount(0)).toBe(0);
		expect(uart.bufferedCount(1)).toBe(0);

		uart.injectBytes(0, ["0x41"]);
		uart.reset();
		expect(uart.bufferedCount(0)).toBe(0);
	});
});

describe("useSimulator - uart commands", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("returns injected bytes from uart_read", () => {
		const { handleDeviceCommand } = useSimulator();
		const uart = useUartStore();
		uart.injectBytes(1, ["0x32", "0x35", "0xFF", "0xFF", "0xFF"]);

		const reply = handleDeviceCommand(
			command("uart_read", { port: 1, bytes_to_read: 64, timeout_ms: 500 }),
		);
		expect(reply).toEqual({
			id: "msg-1",
			type: "uart_read_result",
			payload: {
				port: 1,
				data: ["0x32", "0x35", "0xFF", "0xFF", "0xFF"],
				bytes_read: 5,
			},
		});
	});

	it("returns an empty read on a quiet port", () => {
		const { handleDeviceCommand } = useSimulator();
		const reply = handleDeviceCommand(
			command("uart_read", { port: 2, bytes_to_read: 16 }),
		);
		expect(reply?.type).toBe("uart_read_result");
		expect(reply?.payload).toEqual({ port: 2, data: [], bytes_read: 0 });
	});

	it("honors bytes_to_read when draining the buffer", () => {
		const { handleDeviceCommand } = useSimulator();
		const uart = useUartStore();
		uart.injectBytes(0, ["0x41", "0x42", "0x43"]);

		const reply = handleDeviceCommand(
			command("uart_read", { port: 0, bytes_to_read: 2 }),
		);
		expect((reply?.payload as { data: string[] }).data).toEqual([
			"0x41",
			"0x42",
		]);
		expect(uart.bufferedCount(0)).toBe(1);
	});

	it("tracks uart_configure and clears buffers on reboot", () => {
		const { handleDeviceCommand } = useSimulator();
		const uart = useUartStore();
		uart.injectBytes(1, ["0x41"]);

		handleDeviceCommand(
			command("uart_configure", {
				port: 1,
				tx_pin: 17,
				rx_pin: 16,
				baud_rate: 115200,
			}),
		);
		expect(uart.ports[1]).toMatchObject({
			txPins: [17],
			rxPins: [16],
			baudRate: 115200,
		});

		handleDeviceCommand(command("reboot", {}));
		expect(uart.bufferedCount(1)).toBe(0);
	});
});
