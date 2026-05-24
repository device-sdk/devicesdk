import type { DeviceCommand } from "./commands.js";
import type { DeviceResponse } from "./responses.js";

/**
 * Per-device key/value storage. Persists across reconnects, deploys, and reboots.
 * Values are JSON-serialized; keys are strings.
 *
 * Scope: a single device. To share state across devices, use inter-device RPC
 * (`this.env.DEVICES["other-id"].method()`) or persist to your own backend.
 *
 * @see https://devicesdk.com/docs/concepts/entrypoints/
 */
export interface KVInterface {
	/**
	 * Read a previously stored value. Returns `undefined` if the key doesn't exist.
	 * @example
	 * const last = await this.env.DEVICE.kv.get<number>("last_temp");
	 * if (last !== undefined) console.log(`Previous reading: ${last}°C`);
	 */
	get<T = unknown>(key: string): Promise<T | undefined>;
	/**
	 * Store a value under the given key. Overwrites any existing value.
	 * The value is serialized as JSON, so it must be JSON-safe.
	 * @example
	 * await this.env.DEVICE.kv.put("last_temp", 21.4);
	 * await this.env.DEVICE.kv.put("config", { mode: "auto", target: 22 });
	 */
	put<T>(key: string, value: T): Promise<void>;
	/**
	 * Remove a key. Returns `true` if the key existed, `false` otherwise.
	 */
	delete(key: string): Promise<boolean>;
}

/**
 * Project-scoped environment variables. Set with `devicesdk env set KEY=VALUE`,
 * read here at runtime. Values are returned as strings; cast/parse if you need
 * a number or JSON. Keys must match `[A-Z][A-Z0-9_]{0,63}` (see `ENV_VAR_KEY_REGEX`).
 *
 * @see https://devicesdk.com/docs/concepts/env-vars/
 */
export interface EnvVarsInterface {
	/**
	 * Read a single env var. Returns `undefined` if not set.
	 * @example
	 * const url = await this.env.VARS.get("DISCORD_WEBHOOK_URL");
	 * if (!url) throw new Error("Set DISCORD_WEBHOOK_URL with `devicesdk env set`");
	 */
	get(key: string): Promise<string | undefined>;
	/**
	 * Read every env var as a single map. Useful for debugging; prefer `get` for
	 * known keys.
	 */
	getAll(): Promise<Record<string, string>>;
}

/**
 * The runtime environment your `DeviceEntrypoint` subclass receives as `this.env`.
 * Generic over `ProjectDevices` so inter-device RPC is type-checked. The CLI
 * regenerates `ProjectDevices` from your `devicesdk.ts` config on every build.
 *
 * @see https://devicesdk.com/docs/concepts/entrypoints/
 */
export type UserWorkerEnv<ProjectDevices = {}> = {
	/** Hardware control + per-device KV. See {@link DeviceSenderInterface}. */
	DEVICE: DeviceSenderInterface;
	/** Other devices in this project, keyed by their slug. Methods return Promises. */
	DEVICES: ProjectDevices;
	/** Project-scoped secrets and config. See {@link EnvVarsInterface}. */
	VARS: EnvVarsInterface;
};

/**
 * The hardware-control surface for the current device, exposed as `this.env.DEVICE`.
 *
 * Pin numbers are GPIO numbers as labeled on the board. Most boards expose a
 * **virtual pin 99** that maps to the onboard LED — use it instead of guessing
 * the chip-specific GPIO so your code is portable across Pico W, ESP32-C3, and
 * ESP32-C61.
 *
 * Async methods that return `void` do not wait for the device to ack. Methods
 * returning {@link DeviceResponse} send a command and wait for the matching
 * response event. If the device is offline, the runtime queues the command and
 * delivers it when the device reconnects.
 *
 * @see https://devicesdk.com/docs/concepts/device-api/
 */
export interface DeviceSenderInterface {
	/**
	 * Send an arbitrary {@link DeviceCommand} without waiting for a response.
	 * Prefer the typed convenience methods below — use this only for custom
	 * command types not yet wrapped.
	 */
	sendCommand(command: Omit<DeviceCommand, "id">): Promise<void>;

	/**
	 * Send a command and wait for the device's matching response event.
	 * Prefer the typed convenience methods below.
	 */
	sendCommandAndWait<T extends DeviceCommand>(
		command: Omit<T, "id">,
	): Promise<DeviceResponse>;

	/**
	 * Soft-reboot the device. The connection drops and the device reconnects on its own.
	 * Do not chain commands after this — they will be queued and re-sent on reconnect.
	 */
	reboot(): Promise<void>;

	/**
	 * Drive a GPIO output pin high or low.
	 *
	 * @param pin GPIO number on the device. **Use `99` for the onboard LED**
	 *   (Pico W, Pico 2 W, ESP32-C3 DevKitM-1, ESP32-C61 DevKitC-1). Pico W GPIOs
	 *   are 0–22, 26–28; ESP32 ranges depend on chip.
	 * @param state `"high"` or `"low"` — string literal, not boolean.
	 * @example
	 * // Turn on the onboard LED
	 * await this.env.DEVICE.setGpioState(99, "high");
	 */
	setGpioState(pin: number, state: "high" | "low"): Promise<void>;

	/**
	 * Drive a PWM output pin.
	 *
	 * @param pin GPIO number capable of PWM. On Pico, every GPIO is PWM-capable.
	 * @param frequency PWM frequency in Hz. Typical: 1000–25000 for LEDs, 50 for servos.
	 * @param dutyCycle Duty cycle in the range **0..1** (0 = always off, 1 = always on).
	 *   Pass `0.5` for half brightness, *not* `50`.
	 * @example
	 * // 50% brightness on GPIO 16, 1 kHz PWM
	 * await this.env.DEVICE.setPwmState(16, 1000, 0.5);
	 */
	setPwmState(pin: number, frequency: number, dutyCycle: number): Promise<void>;

	/**
	 * Read a single GPIO/ADC value once. Resolves with a `pin_state_update` event
	 * whose `payload.value` type depends on `mode`: `"high" | "low"` for digital,
	 * a number 0..4095 for analog (Pico ADC).
	 *
	 * @param pin GPIO number. ADC-capable pins on Pico are 26, 27, 28.
	 * @param mode `"digital"` for high/low; `"analog"` for ADC reads.
	 * @example
	 * const result = await this.env.DEVICE.getPinState(26, "analog");
	 * if (result.type === "pin_state_update" && result.payload.mode === "analog") {
	 *   const voltage = (result.payload.value / 4095) * 3.3;
	 * }
	 */
	getPinState(pin: number, mode: "analog" | "digital"): Promise<DeviceResponse>;

	/**
	 * Scan an I2C bus for connected devices. Returns an `i2c_scan_result` event
	 * with the list of responding addresses (as 7-bit hex strings like `"0x3C"`).
	 *
	 * Configure the bus first with {@link i2cConfigure} unless you're using the
	 * default pins for the device's primary bus.
	 */
	i2cScan(bus: number): Promise<DeviceResponse>;

	/**
	 * Write bytes to an I2C device.
	 *
	 * @param bus I2C bus number (0 or 1 on Pico).
	 * @param address 7-bit I2C address as a hex string, e.g. `"0x3C"`.
	 * @param data Array of single bytes as hex strings, e.g. `["0xAE", "0xD5"]`.
	 *   Each entry is one byte; do not pack multiple bytes into one string.
	 */
	i2cWrite(bus: number, address: string, data: string[]): Promise<void>;

	/**
	 * Read bytes from an I2C device. If `registerToRead` is given, the runtime
	 * issues a write of that register byte before reading. Resolves with an
	 * `i2c_read_result` event whose `payload.data` is an array of hex byte strings.
	 *
	 * @param address 7-bit I2C address as a hex string, e.g. `"0x76"`.
	 * @param registerToRead Optional register byte as a hex string, e.g. `"0xD0"`.
	 * @example
	 * const result = await this.env.DEVICE.i2cRead(0, "0x76", 1, "0xD0");
	 * // BME280 chip ID register; result.payload.data[0] should be "0x60"
	 */
	i2cRead(
		bus: number,
		address: string,
		bytesToRead: number,
		registerToRead?: string,
	): Promise<DeviceResponse>;

	/**
	 * Enable or disable per-pin input monitoring. When enabled, the firmware
	 * emits a `gpio_state_changed` event each time the pin transitions, which
	 * arrives in `onMessage`.
	 *
	 * @param pull Internal pull resistor: `"up"` for buttons against ground,
	 *   `"down"` for buttons against 3.3V, `"none"` to leave floating (rare).
	 * @example
	 * await this.env.DEVICE.configureGpioInputMonitoring(20, true, "up");
	 */
	configureGpioInputMonitoring(
		pin: number,
		enable: boolean,
		pull?: "up" | "down" | "none",
	): Promise<void>;

	/**
	 * Read the device's onboard temperature sensor. Resolves with a
	 * `temperature_result` event whose `payload.celsius` is a degrees-C number.
	 * Typically less accurate than an external sensor (BME280, DS18B20, etc.).
	 *
	 * @example
	 * const r = await this.env.DEVICE.getTemperature();
	 * if (r.type === "temperature_result") console.log(`${r.payload.celsius}°C`);
	 */
	getTemperature(): Promise<DeviceResponse>;

	/**
	 * Configure the hardware watchdog. Once enabled with `enable=true`, the
	 * watchdog cannot be disabled until reboot — call {@link watchdogFeed}
	 * within `timeoutMs` or the device hard-resets.
	 *
	 * @param timeoutMs Watchdog timeout in milliseconds. Range varies by chip
	 *   (Pico: up to 8388 ms; ESP32: up to ~30000 ms).
	 */
	watchdogConfigure(timeoutMs: number, enable: boolean): Promise<void>;

	/** Pet the watchdog to reset its countdown. Call before `timeoutMs` elapses. */
	watchdogFeed(): Promise<void>;

	/** Configure an SPI bus. See `mode` for clock polarity/phase semantics. */
	spiConfigure(
		bus: number,
		clkPin: number,
		mosiPin: number,
		misoPin: number,
		csPin: number,
		frequency: number,
		mode: 0 | 1 | 2 | 3,
	): Promise<void>;

	/** Full-duplex SPI exchange: write `data` while reading the same number of bytes. */
	spiTransfer(bus: number, data: string[]): Promise<DeviceResponse>;

	/** Half-duplex SPI write. */
	spiWrite(bus: number, data: string[]): Promise<void>;

	/** Half-duplex SPI read of `bytesToRead` bytes. */
	spiRead(bus: number, bytesToRead: number): Promise<DeviceResponse>;

	/** Configure a UART port. Defaults: 8 data bits, 1 stop bit, no parity. */
	uartConfigure(
		port: number,
		txPin: number,
		rxPin: number,
		baudRate: number,
		dataBits?: 5 | 6 | 7 | 8,
		stopBits?: 1 | 2,
		parity?: "none" | "even" | "odd",
	): Promise<void>;

	/** Write bytes to a UART port. */
	uartWrite(port: number, data: string[]): Promise<void>;

	/** Read up to `bytesToRead` bytes from a UART port, blocking up to `timeoutMs`. */
	uartRead(
		port: number,
		bytesToRead: number,
		timeoutMs?: number,
	): Promise<DeviceResponse>;

	/**
	 * Configure a WS2812 (NeoPixel) strip on the Pico's PIO peripheral. Pico only.
	 * Call once at startup, then drive the strip with {@link pioWs2812Update}.
	 *
	 * For ESP32 boards, the same protocol is driven through `setPwmState`-style
	 * calls handled by the firmware's led_strip component — see the
	 * [Addressable LEDs guide](https://devicesdk.com/docs/guides/addressable-leds/).
	 *
	 * @example
	 * await this.env.DEVICE.pioWs2812Configure(2, 30); // 30 LEDs on GP2
	 */
	pioWs2812Configure(pin: number, numLeds: number): Promise<void>;

	/**
	 * Update the WS2812 strip with one [r, g, b] triplet per LED. Each channel
	 * is 0–255. Sends all pixels in one frame; cheap to call at 30+ Hz.
	 *
	 * @example
	 * // Solid red on a 30-LED strip
	 * const red: [number, number, number][] = Array.from({ length: 30 }, () => [255, 0, 0]);
	 * await this.env.DEVICE.pioWs2812Update(red);
	 */
	pioWs2812Update(pixels: [number, number, number][]): Promise<void>;

	/** Per-device key/value storage. See {@link KVInterface}. */
	kv: KVInterface;

	/**
	 * Append a structured log entry visible in `devicesdk logs --tail` and the
	 * dashboard. Prefer plain `console.log/info/warn/error` — those are captured
	 * automatically. Use this when you need to control the level explicitly.
	 */
	persistLog(level: string, message: string): Promise<void>;

	/**
	 * Emit a structured state event to real-time watchers (dashboard, Home
	 * Assistant). Use this to expose custom telemetry — ADC readings, computed
	 * values, sensor outputs — as entities in external integrations.
	 *
	 * `entityId` must match a declaration in `devicesdk.ts` under `ha.entities`
	 * for it to surface in Home Assistant.
	 *
	 * @example
	 * // Declare in devicesdk.ts:
	 * //   ha: { entities: [{ entity_id: "soil_moisture", type: "sensor", source: "user", unit: "%", name: "Soil moisture" }] }
	 * await this.env.DEVICE.emitState("soil_moisture", 42);
	 *
	 * @see https://devicesdk.com/docs/concepts/emit-state/
	 */
	emitState(entityId: string, value: unknown): Promise<void>;
}

// Props passed to the DeviceSender entrypoint
export interface DeviceSenderProps {
	projectId: string;
	deviceId: string;
}

export type Content = {};
