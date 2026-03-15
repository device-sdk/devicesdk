import { describe, expect, it } from "vitest";
import type { DeviceCommandResponse } from "../api.js";
import { formatResponse, parseCommand } from "./inspect.js";

describe("parseCommand", () => {
	it("parses gpio read", () => {
		const result = parseCommand("gpio read 5");
		expect(result).toEqual({
			command: { type: "get_pin_state", payload: { pin: 5, mode: "digital" } },
		});
	});

	it("parses gpio write high", () => {
		const result = parseCommand("gpio write 25 high");
		expect(result).toEqual({
			command: { type: "set_gpio_state", payload: { pin: 25, state: "high" } },
		});
	});

	it("parses gpio write low", () => {
		const result = parseCommand("gpio write 13 low");
		expect(result).toEqual({
			command: { type: "set_gpio_state", payload: { pin: 13, state: "low" } },
		});
	});

	it("parses adc read", () => {
		const result = parseCommand("adc read 26");
		expect(result).toEqual({
			command: { type: "get_pin_state", payload: { pin: 26, mode: "analog" } },
		});
	});

	it("parses pwm", () => {
		const result = parseCommand("pwm 15 1000 50");
		expect(result).toEqual({
			command: {
				type: "set_pwm_state",
				payload: { pin: 15, frequency: 1000, duty_cycle: 50 },
			},
		});
	});

	it("parses i2c scan with default bus", () => {
		const result = parseCommand("i2c scan");
		expect(result).toEqual({
			command: { type: "i2c_scan", payload: { bus: 0 } },
		});
	});

	it("parses i2c scan with explicit bus", () => {
		const result = parseCommand("i2c scan 1");
		expect(result).toEqual({
			command: { type: "i2c_scan", payload: { bus: 1 } },
		});
	});

	it("parses i2c read with register", () => {
		const result = parseCommand("i2c read 0 0x76 6 0xF7");
		expect(result).toEqual({
			command: {
				type: "i2c_read",
				payload: {
					bus: 0,
					address: "0x76",
					bytes_to_read: 6,
					register_to_read: "0xF7",
				},
			},
		});
	});

	it("parses i2c read without register", () => {
		const result = parseCommand("i2c read 0 0x76 4");
		expect(result).toEqual({
			command: {
				type: "i2c_read",
				payload: { bus: 0, address: "0x76", bytes_to_read: 4 },
			},
		});
	});

	it("parses i2c write", () => {
		const result = parseCommand("i2c write 0 0x3C 0x00 0xAE");
		expect(result).toEqual({
			command: {
				type: "i2c_write",
				payload: { bus: 0, address: "0x3C", data: ["0x00", "0xAE"] },
			},
		});
	});

	it("parses i2c configure", () => {
		const result = parseCommand("i2c configure 0 4 5");
		expect(result).toEqual({
			command: {
				type: "i2c_configure",
				payload: { bus: 0, sda_pin: 4, scl_pin: 5 },
			},
		});
	});

	it("parses i2c configure with frequency", () => {
		const result = parseCommand("i2c configure 0 4 5 400000");
		expect(result).toEqual({
			command: {
				type: "i2c_configure",
				payload: { bus: 0, sda_pin: 4, scl_pin: 5, frequency: 400000 },
			},
		});
	});

	it("parses monitor with pull", () => {
		const result = parseCommand("monitor 3 up");
		expect(result).toEqual({
			command: {
				type: "configure_gpio_input_monitoring",
				payload: { pin: 3, enable: true, pull: "up" },
			},
		});
	});

	it("parses reboot", () => {
		const result = parseCommand("reboot");
		expect(result).toEqual({
			command: { type: "reboot", payload: {} },
		});
	});

	it("returns error for unknown command", () => {
		const result = parseCommand("blink 5");
		expect(result).toHaveProperty("error");
		expect((result as { error: string }).error).toContain("Unknown command");
	});

	it("returns error for invalid pin in gpio read", () => {
		const result = parseCommand("gpio read abc");
		expect(result).toHaveProperty("error");
		expect((result as { error: string }).error).toContain("Invalid pin number");
	});

	it("returns error for invalid state in gpio write", () => {
		const result = parseCommand("gpio write 5 blink");
		expect(result).toHaveProperty("error");
		expect((result as { error: string }).error).toContain("Invalid state");
	});
});

describe("formatResponse", () => {
	it("formats pin_state_update for digital pin (high)", () => {
		const resp: DeviceCommandResponse = {
			id: "abc",
			type: "pin_state_update",
			payload: { pin: 5, mode: "digital", value: 1 },
		};
		expect(formatResponse(resp)).toBe("Pin 5: HIGH");
	});

	it("formats pin_state_update for digital pin (low)", () => {
		const resp: DeviceCommandResponse = {
			id: "abc",
			type: "pin_state_update",
			payload: { pin: 13, mode: "digital", value: 0 },
		};
		expect(formatResponse(resp)).toBe("Pin 13: LOW");
	});

	it("formats pin_state_update for analog pin", () => {
		const resp: DeviceCommandResponse = {
			id: "abc",
			type: "pin_state_update",
			payload: { pin: 26, mode: "analog", value: 2048 },
		};
		expect(formatResponse(resp)).toBe("Pin 26 (analog): 2048");
	});

	it("formats i2c_scan_result with devices found", () => {
		const resp: DeviceCommandResponse = {
			id: "abc",
			type: "i2c_scan_result",
			payload: { bus: 0, addresses_found: ["0x3C", "0x68", "0x76"] },
		};
		expect(formatResponse(resp)).toBe(
			"Found 3 device(s) on bus 0: 0x3C, 0x68, 0x76",
		);
	});

	it("formats i2c_scan_result with no devices found", () => {
		const resp: DeviceCommandResponse = {
			id: "abc",
			type: "i2c_scan_result",
			payload: { bus: 1, addresses_found: [] },
		};
		expect(formatResponse(resp)).toBe("No I2C devices found on bus 1");
	});

	it("formats i2c_read_result", () => {
		const resp: DeviceCommandResponse = {
			id: "abc",
			type: "i2c_read_result",
			payload: { bus: 0, address: "0x76", data: ["0x12", "0x34", "0x56"] },
		};
		expect(formatResponse(resp)).toBe("Read from 0x76: [0x12, 0x34, 0x56]");
	});

	it("formats command_ack", () => {
		const resp: DeviceCommandResponse = {
			id: "abc",
			type: "command_ack",
			payload: { command_type: "set_gpio_state" },
		};
		expect(formatResponse(resp)).toBe("OK");
	});

	it("formats command_error", () => {
		const resp: DeviceCommandResponse = {
			id: "abc",
			type: "command_error",
			payload: { command_type: "set_gpio_state", error: "Pin not configured" },
		};
		expect(formatResponse(resp)).toContain("Error: Pin not configured");
	});
});
