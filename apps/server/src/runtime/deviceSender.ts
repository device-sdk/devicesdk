import type { DeviceCommand, DeviceResponse } from "@devicesdk/core";
import type { KVInterface } from "./types";

// --- Client-side validation helpers ---
//
// Synchronously validate user-supplied arguments before they round-trip to the
// firmware. Without this, a bad value (pin out of range, duty cycle out of
// 0..1, malformed I2C address) silently fires and the user only sees a
// `command_error` event in `onMessage` — which they often haven't wired up.
// Throwing locally means agents and humans alike get an actionable stack with
// the exact field that's wrong.

function fail(
	field: string,
	got: unknown,
	expected: string,
	docs: string,
): never {
	const error = new Error(
		`DeviceSDK: invalid ${field} (${JSON.stringify(got)}). Expected ${expected}. See ${docs}`,
	);
	(error as Error & { code?: string; docs?: string }).code = "invalid_argument";
	(error as Error & { code?: string; docs?: string }).docs = docs;
	throw error;
}

const PIN_MIN = 0;
const PIN_MAX = 99; // 99 = virtual onboard LED
const I2C_ADDR_RE = /^0x[0-9A-Fa-f]{1,2}$/;
const I2C_BYTE_RE = /^0x[0-9A-Fa-f]{1,2}$/;

function validatePin(pin: number, docs: string): void {
	if (!Number.isInteger(pin) || pin < PIN_MIN || pin > PIN_MAX) {
		fail(
			"pin",
			pin,
			`an integer in ${PIN_MIN}..${PIN_MAX} (use 99 for the onboard LED)`,
			docs,
		);
	}
}

function validateBus(bus: number, docs: string): void {
	if (!Number.isInteger(bus) || bus < 0 || bus > 7) {
		fail("bus", bus, "a non-negative integer (typically 0 or 1)", docs);
	}
}

function validateI2cAddress(address: string, docs: string): void {
	if (typeof address !== "string" || !I2C_ADDR_RE.test(address)) {
		fail("I2C address", address, 'a 7-bit hex string like "0x3C"', docs);
	}
}

function validateHexBytes(data: unknown, docs: string): void {
	if (!Array.isArray(data)) {
		fail(
			"data",
			data,
			'an array of single-byte hex strings like ["0xAE", "0xD5"]',
			docs,
		);
	}
	for (const byte of data) {
		if (typeof byte !== "string" || !I2C_BYTE_RE.test(byte)) {
			fail(
				"data byte",
				byte,
				'a single-byte hex string like "0xAE" — one byte per array element, do not pack',
				docs,
			);
		}
	}
}

function validatePixel(
	pixel: unknown,
	index: number,
	docs: string,
): asserts pixel is [number, number, number] {
	if (!Array.isArray(pixel) || pixel.length !== 3) {
		fail(`pixels[${index}]`, pixel, "an [r, g, b] triplet (each 0..255)", docs);
	}
	for (const channel of pixel as unknown[]) {
		if (
			!Number.isInteger(channel) ||
			(channel as number) < 0 ||
			(channel as number) > 255
		) {
			fail(`pixels[${index}] channel`, channel, "an integer in 0..255", docs);
		}
	}
}

/**
 * The command/KV surface a device session exposes to its sender. Implemented
 * by DeviceSession; typed separately to avoid a circular import.
 */
export interface SenderTransport {
	sendCommandWithoutAck(command: DeviceCommand): void;
	sendCommandAndWaitForResponse(
		command: DeviceCommand,
	): Promise<DeviceResponse>;
	kvGet<T = unknown>(key: string): Promise<T | undefined>;
	kvPut<T>(key: string, value: T): Promise<void>;
	kvDelete(key: string): Promise<boolean>;
	persistLog(level: string, message: string): void;
	emitState(entityId: string, value: unknown): void;
}

/**
 * In-process implementation of the DEVICE binding handed to user scripts.
 * Port of the Worker Loader DeviceSender entrypoint: identical validation and
 * command payloads, but methods call straight into the device session instead
 * of RPC-ing into a Durable Object stub.
 */
export class LocalDeviceSender {
	private transport: SenderTransport;
	readonly kv: KVInterface;

	constructor(transport: SenderTransport) {
		this.transport = transport;
		this.kv = {
			get: <T = unknown>(key: string) => transport.kvGet<T>(key),
			put: <T>(key: string, value: T) => transport.kvPut(key, value),
			delete: (key: string) => transport.kvDelete(key),
		};
	}

	async sendCommand(command: Omit<DeviceCommand, "id">): Promise<void> {
		const fullCommand = {
			...command,
			id: crypto.randomUUID(),
		} as DeviceCommand;
		this.transport.sendCommandWithoutAck(fullCommand);
	}

	async sendCommandAndWait(
		command: Omit<DeviceCommand, "id">,
	): Promise<DeviceResponse> {
		const fullCommand = {
			...command,
			id: crypto.randomUUID(),
		} as DeviceCommand;
		return this.transport.sendCommandAndWaitForResponse(fullCommand);
	}

	async reboot(): Promise<void> {
		await this.sendCommand({ type: "reboot", payload: {} });
	}

	async setGpioState(pin: number, state: "high" | "low"): Promise<void> {
		validatePin(pin, "https://devicesdk.com/docs/concepts/device-api/");
		if (state !== "high" && state !== "low") {
			fail(
				"state",
				state,
				'"high" or "low"',
				"https://devicesdk.com/docs/concepts/device-api/",
			);
		}
		await this.sendCommand({
			type: "set_gpio_state",
			payload: { pin, state },
		});
	}

	async setPwmState(
		pin: number,
		frequency: number,
		dutyCycle: number,
	): Promise<void> {
		const docs = "https://devicesdk.com/docs/concepts/device-api/";
		validatePin(pin, docs);
		if (
			!Number.isFinite(frequency) ||
			frequency < 1 ||
			frequency > 50_000_000
		) {
			fail(
				"frequency",
				frequency,
				"a positive number in 1..50000000 Hz (typical: 1000–25000 for LEDs, 50 for servos)",
				docs,
			);
		}
		if (!Number.isFinite(dutyCycle) || dutyCycle < 0 || dutyCycle > 1) {
			fail(
				"dutyCycle",
				dutyCycle,
				"a number in 0..1 (NOT a percent — pass 0.5 for half, not 50)",
				docs,
			);
		}
		await this.sendCommand({
			type: "set_pwm_state",
			payload: { pin, frequency, duty_cycle: dutyCycle },
		});
	}

	async getPinState(
		pin: number,
		mode: "analog" | "digital",
	): Promise<DeviceResponse> {
		const docs = "https://devicesdk.com/docs/concepts/device-api/";
		validatePin(pin, docs);
		if (mode !== "analog" && mode !== "digital") {
			fail("mode", mode, '"analog" or "digital"', docs);
		}
		return this.sendCommandAndWait({
			type: "get_pin_state",
			payload: { pin, mode },
		});
	}

	async i2cScan(bus: number): Promise<DeviceResponse> {
		validateBus(bus, "https://devicesdk.com/docs/guides/using-i2c/");
		return this.sendCommandAndWait({
			type: "i2c_scan",
			payload: { bus },
		});
	}

	async i2cWrite(bus: number, address: string, data: string[]): Promise<void> {
		const docs = "https://devicesdk.com/docs/guides/using-i2c/";
		validateBus(bus, docs);
		validateI2cAddress(address, docs);
		validateHexBytes(data, docs);
		await this.sendCommand({
			type: "i2c_write",
			payload: { bus, address, data },
		});
	}

	async i2cRead(
		bus: number,
		address: string,
		bytesToRead: number,
		registerToRead?: string,
	): Promise<DeviceResponse> {
		const docs = "https://devicesdk.com/docs/guides/using-i2c/";
		validateBus(bus, docs);
		validateI2cAddress(address, docs);
		if (
			!Number.isInteger(bytesToRead) ||
			bytesToRead < 1 ||
			bytesToRead > 4096
		) {
			fail("bytesToRead", bytesToRead, "an integer in 1..4096", docs);
		}
		if (registerToRead !== undefined) {
			if (
				typeof registerToRead !== "string" ||
				!I2C_BYTE_RE.test(registerToRead)
			) {
				fail(
					"registerToRead",
					registerToRead,
					'a single-byte hex string like "0xD0", or omit',
					docs,
				);
			}
		}
		return this.sendCommandAndWait({
			type: "i2c_read",
			payload: {
				bus,
				address,
				bytes_to_read: bytesToRead,
				register_to_read: registerToRead,
			},
		});
	}

	async configureGpioInputMonitoring(
		pin: number,
		enable: boolean,
		pull: "up" | "down" | "none" = "up",
	): Promise<void> {
		const docs = "https://devicesdk.com/docs/concepts/device-api/";
		validatePin(pin, docs);
		if (pull !== "up" && pull !== "down" && pull !== "none") {
			fail("pull", pull, '"up", "down", or "none"', docs);
		}
		await this.sendCommand({
			type: "configure_gpio_input_monitoring",
			payload: { pin, enable, pull },
		});
	}

	async getTemperature(): Promise<DeviceResponse> {
		return this.sendCommandAndWait({
			type: "get_temperature",
			payload: {},
		});
	}

	async watchdogConfigure(timeoutMs: number, enable: boolean): Promise<void> {
		const docs = "https://devicesdk.com/docs/concepts/device-api/";
		// Pico's hardware watchdog tops out at 8388 ms; ESP32 goes higher (~30s).
		// We accept the looser ESP32 ceiling here; firmware will clamp on Pico.
		if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
			fail(
				"timeoutMs",
				timeoutMs,
				"a number in 1..30000 ms (Pico clamps to 8388)",
				docs,
			);
		}
		await this.sendCommand({
			type: "watchdog_configure",
			payload: { timeout_ms: timeoutMs, enable },
		});
	}

	async watchdogFeed(): Promise<void> {
		await this.sendCommand({
			type: "watchdog_feed",
			payload: {},
		});
	}

	async spiConfigure(
		bus: number,
		clkPin: number,
		mosiPin: number,
		misoPin: number,
		csPin: number,
		frequency: number,
		mode: 0 | 1 | 2 | 3,
	): Promise<void> {
		const docs = "https://devicesdk.com/docs/guides/using-spi/";
		validateBus(bus, docs);
		validatePin(clkPin, docs);
		validatePin(mosiPin, docs);
		validatePin(misoPin, docs);
		validatePin(csPin, docs);
		if (
			!Number.isFinite(frequency) ||
			frequency < 1 ||
			frequency > 62_500_000
		) {
			fail(
				"frequency",
				frequency,
				"a positive number in 1..62500000 Hz (typical: 1_000_000–10_000_000)",
				docs,
			);
		}
		if (mode !== 0 && mode !== 1 && mode !== 2 && mode !== 3) {
			fail("mode", mode, "0, 1, 2, or 3 (CPOL/CPHA combinations)", docs);
		}
		await this.sendCommand({
			type: "spi_configure",
			payload: {
				bus,
				clk_pin: clkPin,
				mosi_pin: mosiPin,
				miso_pin: misoPin,
				cs_pin: csPin,
				frequency,
				mode,
			},
		});
	}

	async spiTransfer(bus: number, data: string[]): Promise<DeviceResponse> {
		const docs = "https://devicesdk.com/docs/guides/using-spi/";
		validateBus(bus, docs);
		validateHexBytes(data, docs);
		return this.sendCommandAndWait({
			type: "spi_transfer",
			payload: { bus, data },
		});
	}

	async spiWrite(bus: number, data: string[]): Promise<void> {
		const docs = "https://devicesdk.com/docs/guides/using-spi/";
		validateBus(bus, docs);
		validateHexBytes(data, docs);
		await this.sendCommand({
			type: "spi_write",
			payload: { bus, data },
		});
	}

	async spiRead(bus: number, bytesToRead: number): Promise<DeviceResponse> {
		const docs = "https://devicesdk.com/docs/guides/using-spi/";
		validateBus(bus, docs);
		if (
			!Number.isInteger(bytesToRead) ||
			bytesToRead < 1 ||
			bytesToRead > 4096
		) {
			fail("bytesToRead", bytesToRead, "an integer in 1..4096", docs);
		}
		return this.sendCommandAndWait({
			type: "spi_read",
			payload: { bus, bytes_to_read: bytesToRead },
		});
	}

	async uartConfigure(
		port: number,
		txPin: number,
		rxPin: number,
		baudRate: number,
		dataBits?: 5 | 6 | 7 | 8,
		stopBits?: 1 | 2,
		parity?: "none" | "even" | "odd",
	): Promise<void> {
		const docs = "https://devicesdk.com/docs/guides/using-uart/";
		validateBus(port, docs);
		validatePin(txPin, docs);
		validatePin(rxPin, docs);
		if (!Number.isInteger(baudRate) || baudRate < 50 || baudRate > 5_000_000) {
			fail(
				"baudRate",
				baudRate,
				"an integer in 50..5000000 (typical: 9600, 115200)",
				docs,
			);
		}
		if (dataBits !== undefined && ![5, 6, 7, 8].includes(dataBits)) {
			fail("dataBits", dataBits, "5, 6, 7, or 8", docs);
		}
		if (stopBits !== undefined && stopBits !== 1 && stopBits !== 2) {
			fail("stopBits", stopBits, "1 or 2", docs);
		}
		if (
			parity !== undefined &&
			parity !== "none" &&
			parity !== "even" &&
			parity !== "odd"
		) {
			fail("parity", parity, '"none", "even", or "odd"', docs);
		}
		await this.sendCommand({
			type: "uart_configure",
			payload: {
				port,
				tx_pin: txPin,
				rx_pin: rxPin,
				baud_rate: baudRate,
				data_bits: dataBits,
				stop_bits: stopBits,
				parity,
			},
		});
	}

	async uartWrite(port: number, data: string[]): Promise<void> {
		const docs = "https://devicesdk.com/docs/guides/using-uart/";
		validateBus(port, docs);
		validateHexBytes(data, docs);
		await this.sendCommand({
			type: "uart_write",
			payload: { port, data },
		});
	}

	async uartRead(
		port: number,
		bytesToRead: number,
		timeoutMs?: number,
	): Promise<DeviceResponse> {
		const docs = "https://devicesdk.com/docs/guides/using-uart/";
		validateBus(port, docs);
		if (
			!Number.isInteger(bytesToRead) ||
			bytesToRead < 1 ||
			bytesToRead > 4096
		) {
			fail("bytesToRead", bytesToRead, "an integer in 1..4096", docs);
		}
		if (timeoutMs !== undefined) {
			if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 60_000) {
				fail("timeoutMs", timeoutMs, "a number in 0..60000 ms, or omit", docs);
			}
		}
		return this.sendCommandAndWait({
			type: "uart_read",
			payload: {
				port,
				bytes_to_read: bytesToRead,
				timeout_ms: timeoutMs,
			},
		});
	}

	async pioWs2812Configure(pin: number, numLeds: number): Promise<void> {
		const docs = "https://devicesdk.com/docs/guides/addressable-leds/";
		validatePin(pin, docs);
		if (!Number.isInteger(numLeds) || numLeds < 1 || numLeds > 1024) {
			fail("numLeds", numLeds, "an integer in 1..1024", docs);
		}
		await this.sendCommand({
			type: "pio_ws2812_configure",
			payload: { pin, num_leds: numLeds },
		});
	}

	async pioWs2812Update(pixels: [number, number, number][]): Promise<void> {
		const docs = "https://devicesdk.com/docs/guides/addressable-leds/";
		if (!Array.isArray(pixels)) {
			fail(
				"pixels",
				pixels,
				"an array of [r, g, b] triplets, e.g. [[255, 0, 0], [0, 255, 0]]",
				docs,
			);
		}
		for (let i = 0; i < pixels.length; i++) {
			validatePixel(pixels[i], i, docs);
		}
		await this.sendCommand({
			type: "pio_ws2812_update",
			payload: { pixels },
		});
	}

	async persistLog(level: string, message: string): Promise<void> {
		this.transport.persistLog(level, message);
	}

	async emitState(entityId: string, value: unknown): Promise<void> {
		this.transport.emitState(entityId, value);
	}
}
