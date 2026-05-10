// --- Generic Command Structure ---
export interface Command<T extends string, P> {
	id: string;
	type: T;
	payload: P;
}

// --- GPIO Commands ---
export type SetGpioStateCommand = Command<
	"set_gpio_state",
	{
		pin: number;
		state: "high" | "low";
	}
>;

// --- PWM Commands ---
export type SetPwmStateCommand = Command<
	"set_pwm_state",
	{
		pin: number;
		frequency: number;
		duty_cycle: number;
	}
>;

// --- Pin Monitoring Commands ---
export type SetPinConfigCommand = Command<
	"set_pin_config",
	{
		pin: number;
		mode: "analog" | "digital";
		report_policy: "interval" | "on_change";
		report_interval_ms?: number;
		report_change_threshold_percent?: number;
	}
>;

export type GetPinStateCommand = Command<
	"get_pin_state",
	{
		pin: number;
		mode: "analog" | "digital";
	}
>;

// --- I2C Commands ---
export type I2cScanCommand = Command<
	"i2c_scan",
	{
		bus: number;
	}
>;

export type I2cWriteCommand = Command<
	"i2c_write",
	{
		bus: number;
		address: string;
		data: string[];
	}
>;

export type I2cReadCommand = Command<
	"i2c_read",
	{
		bus: number;
		address: string;
		register_to_read?: string;
		bytes_to_read: number;
	}
>;

// --- I2C Configuration Command ---
export type I2cConfigureCommand = Command<
	"i2c_configure",
	{
		bus: number;
		sda_pin: number;
		scl_pin: number;
		frequency?: number;
	}
>;

// --- I2C Batch Commands (for reducing round-trips) ---
export type I2cBatchWriteCommand = Command<
	"i2c_batch_write",
	{
		bus: number;
		address: string;
		writes: string[][];
	}
>;

// --- Display Commands (optimized for large framebuffers) ---
export type DisplayController = "ssd1306" | "sh1106";

export interface DisplaySegment {
	offset: number;
	data: string; // base64
}

export type DisplayUpdateCommand = Command<
	"display_update",
	{
		bus: number;
		address: string;
		controller: DisplayController;
		width: number;
		height: number;
		// Columns 0..width-1 in the framebuffer map to columnOffset..columnOffset+width-1 in
		// controller RAM. Needed for glass sizes where the visible window is not at column 0
		// (e.g. the 0.42" 72x40 SSD1306 boards, which sit at column offset 28 on most FN4
		// boards — 30 and 32 also exist).
		columnOffset?: number;
		pageOffset?: number;
		init?: boolean;
		segments: DisplaySegment[];
	}
>;

// --- GPIO Input Monitoring Commands ---
export type ConfigureGpioInputMonitoringCommand = Command<
	"configure_gpio_input_monitoring",
	{
		pin: number;
		enable: boolean;
		pull?: "up" | "down" | "none";
	}
>;

// --- Temperature Sensor Commands ---
export type GetTemperatureCommand = Command<"get_temperature", {}>;

// --- Watchdog Commands ---
export type WatchdogConfigureCommand = Command<
	"watchdog_configure",
	{
		timeout_ms: number;
		enable: boolean;
	}
>;

export type WatchdogFeedCommand = Command<
	"watchdog_feed",
	Record<string, never>
>;

// --- SPI Commands ---
export type SpiConfigureCommand = Command<
	"spi_configure",
	{
		bus: number;
		clk_pin: number;
		mosi_pin: number;
		miso_pin: number;
		cs_pin: number;
		frequency: number;
		mode: 0 | 1 | 2 | 3;
	}
>;

export type SpiTransferCommand = Command<
	"spi_transfer",
	{
		bus: number;
		data: string[];
	}
>;

export type SpiWriteCommand = Command<
	"spi_write",
	{
		bus: number;
		data: string[];
	}
>;

export type SpiReadCommand = Command<
	"spi_read",
	{
		bus: number;
		bytes_to_read: number;
	}
>;

// --- UART Commands ---
export type UartConfigureCommand = Command<
	"uart_configure",
	{
		port: number;
		tx_pin: number;
		rx_pin: number;
		baud_rate: number;
		data_bits?: 5 | 6 | 7 | 8;
		stop_bits?: 1 | 2;
		parity?: "none" | "even" | "odd";
	}
>;

export type UartWriteCommand = Command<
	"uart_write",
	{
		port: number;
		data: string[];
	}
>;

export type UartReadCommand = Command<
	"uart_read",
	{
		port: number;
		bytes_to_read: number;
		timeout_ms?: number;
	}
>;

// --- PIO Commands (Pico only) ---
export type PioWs2812ConfigureCommand = Command<
	"pio_ws2812_configure",
	{
		pin: number;
		num_leds: number;
	}
>;

export type PioWs2812UpdateCommand = Command<
	"pio_ws2812_update",
	{
		pixels: [number, number, number][];
	}
>;

// --- Device Commands ---
export type RebootCommand = Command<"reboot", {}>;

// --- Union of all possible commands ---
export type DeviceCommand =
	| SetGpioStateCommand
	| SetPwmStateCommand
	| SetPinConfigCommand
	| GetPinStateCommand
	| I2cConfigureCommand
	| I2cScanCommand
	| I2cWriteCommand
	| I2cReadCommand
	| I2cBatchWriteCommand
	| DisplayUpdateCommand
	| RebootCommand
	| ConfigureGpioInputMonitoringCommand
	| GetTemperatureCommand
	| WatchdogConfigureCommand
	| WatchdogFeedCommand
	| SpiConfigureCommand
	| SpiTransferCommand
	| SpiWriteCommand
	| SpiReadCommand
	| UartConfigureCommand
	| UartWriteCommand
	| UartReadCommand
	| PioWs2812ConfigureCommand
	| PioWs2812UpdateCommand;

// --- Device Responses ---
interface BaseResponse {
	id: string; // Should match the ID of the command it's responding to.
}

export interface DeviceConnected extends BaseResponse {
	type: "device_connected";
}

// Discriminated by `payload.mode` so the value type is precise per mode:
// digital reads return "high" | "low" (matching the firmware's natural shape),
// analog reads return a numeric ADC value.
export type PinStateUpdate =
	| (BaseResponse & {
			type: "pin_state_update";
			payload: {
				pin: number;
				mode: "digital";
				value: "high" | "low";
			};
	  })
	| (BaseResponse & {
			type: "pin_state_update";
			payload: {
				pin: number;
				mode: "analog";
				value: number;
			};
	  });

export interface I2cScanResult extends BaseResponse {
	type: "i2c_scan_result";
	payload: {
		bus: number;
		addresses_found: string[];
	};
}

export interface I2cReadResult extends BaseResponse {
	type: "i2c_read_result";
	payload: {
		bus: number;
		address: string;
		data: string[];
	};
}

export interface CommandAck extends BaseResponse {
	type: "command_ack";
	payload: {
		command_type: string;
	};
}

export interface CommandError extends BaseResponse {
	type: "command_error";
	payload: {
		command_type: string;
		error: string;
	};
}

export interface GpioStateChanged extends BaseResponse {
	type: "gpio_state_changed";
	payload: {
		pin: number;
		state: "high" | "low";
	};
}

export interface TemperatureResult extends BaseResponse {
	type: "temperature_result";
	payload: {
		celsius: number;
	};
}

export interface SpiTransferResult extends BaseResponse {
	type: "spi_transfer_result";
	payload: {
		bus: number;
		data: string[];
	};
}

export interface SpiReadResult extends BaseResponse {
	type: "spi_read_result";
	payload: {
		bus: number;
		data: string[];
	};
}

export interface UartReadResult extends BaseResponse {
	type: "uart_read_result";
	payload: {
		port: number;
		data: string[];
		bytes_read: number;
	};
}

export type DeviceResponse =
	| DeviceConnected
	| PinStateUpdate
	| I2cScanResult
	| I2cReadResult
	| CommandAck
	| CommandError
	| GpioStateChanged
	| TemperatureResult
	| SpiTransferResult
	| SpiReadResult
	| UartReadResult;

// --- Command to Response Mapping ---
export type CommandResponseTypeMap = {
	reboot: CommandAck;
	set_gpio_state: CommandAck;
	set_pwm_state: CommandAck;
	set_pin_config: CommandAck;
	get_pin_state: PinStateUpdate;
	i2c_configure: CommandAck;
	i2c_scan: I2cScanResult;
	i2c_write: CommandAck;
	i2c_read: I2cReadResult;
	i2c_batch_write: CommandAck;
	display_update: CommandAck;
	configure_gpio_input_monitoring: CommandAck;
	get_temperature: TemperatureResult;
	watchdog_configure: CommandAck;
	watchdog_feed: CommandAck;
	spi_configure: CommandAck;
	spi_transfer: SpiTransferResult;
	spi_write: CommandAck;
	spi_read: SpiReadResult;
	uart_configure: CommandAck;
	uart_write: CommandAck;
	uart_read: UartReadResult;
	pio_ws2812_configure: CommandAck;
	pio_ws2812_update: CommandAck;
};

// Env var key validation: uppercase letters, digits, underscores, max 64 chars, must start with a letter
export const ENV_VAR_KEY_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/;

// ---- Branded ID types ----
// These are nominal aliases of `string`. They cost nothing at runtime, but
// catch the most common LLM mistake — passing a `projectId` where a `deviceId`
// is expected — at compile time.
//
// The constructors (`asProjectId`, `asDeviceId`, ...) validate at the boundary
// where untyped strings enter your code (CLI args, API request params, etc.)
// and brand them. From that point on the type system tracks identity.

declare const __brand: unique symbol;
type Brand<B extends string> = { readonly [__brand]: B };

/** A DeviceSDK project ID. Use {@link asProjectId} to construct one from a string. */
export type ProjectId = string & Brand<"ProjectId">;
/** A DeviceSDK device ID, scoped to a project. Use {@link asDeviceId}. */
export type DeviceId = string & Brand<"DeviceId">;
/** A DeviceSDK script version ID. Use {@link asScriptId}. */
export type ScriptId = string & Brand<"ScriptId">;
/** A DeviceSDK API or CLI token. Use {@link asTokenId}. */
export type TokenId = string & Brand<"TokenId">;

/** Project ID validator: 3..64 chars, lowercase alnum + hyphen, must start with a letter. */
export const PROJECT_ID_REGEX = /^[a-z][a-z0-9-]{2,63}$/;
/** Device ID validator: same shape as project IDs. */
export const DEVICE_ID_REGEX = /^[a-z][a-z0-9-]{2,63}$/;

function brand<B extends string>(
	value: string,
	check: ((s: string) => boolean) | undefined,
	label: string,
): string & Brand<B> {
	if (check && !check(value)) {
		throw new Error(
			`Invalid ${label}: "${value}". Expected ${label === "ProjectId" ? "lowercase letters, digits, hyphens; 3..64 chars; must start with a letter" : "the documented format"}.`,
		);
	}
	return value as string & Brand<B>;
}

/** Validate and brand a string as a {@link ProjectId}. Throws on invalid input. */
export const asProjectId = (s: string): ProjectId =>
	brand<"ProjectId">(
		s,
		(v) => PROJECT_ID_REGEX.test(v),
		"ProjectId",
	) as ProjectId;
/** Validate and brand a string as a {@link DeviceId}. Throws on invalid input. */
export const asDeviceId = (s: string): DeviceId =>
	brand<"DeviceId">(s, (v) => DEVICE_ID_REGEX.test(v), "DeviceId") as DeviceId;
/** Brand a string as a {@link ScriptId}. No format check (server-assigned UUIDs). */
export const asScriptId = (s: string): ScriptId =>
	brand<"ScriptId">(s, undefined, "ScriptId") as ScriptId;
/** Brand a string as a {@link TokenId}. No format check (opaque). */
export const asTokenId = (s: string): TokenId =>
	brand<"TokenId">(s, undefined, "TokenId") as TokenId;

/**
 * Virtual GPIO that maps to the onboard LED on every supported board.
 *
 * - Pico W: WiFi-chip LED (not a real GPIO)
 * - Pico 2W: GPIO 25
 * - ESP32-C3 DevKitM-1: WS2812 on GPIO 8
 * - ESP32-C61 DevKitC-1: WS2812 on GPIO 5
 *
 * Use this constant in `setGpioState` to keep your code portable across
 * targets — the firmware translates it to the right physical pin.
 *
 * @example
 * await this.env.DEVICE.setGpioState(OnboardLED, "high");
 */
export const OnboardLED = 99 as const;

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
 * a number or JSON. Keys must match `[A-Z][A-Z0-9_]{0,63}` (see {@link ENV_VAR_KEY_REGEX}).
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

// ---- Home Assistant integration types ----
// These types describe the entity declarations users can add to `devicesdk.ts`
// under the `ha` key, and are uploaded to the API on deploy for consumption
// by the Home Assistant custom integration.

export type HaEntityType =
	| "binary_sensor"
	| "sensor"
	| "switch"
	| "light"
	| "number";

export type HaEntitySource =
	| "gpio_state_changed"
	| "pin_state_update"
	| "temperature_result"
	| "user";

export interface HaEntityDeclaration {
	/** Stable ID unique within the device, e.g. "front_door", "soil_moisture". */
	entity_id: string;
	/** Home Assistant platform the entity maps to. */
	type: HaEntityType;
	/** Human-readable name shown in the Home Assistant UI. */
	name: string;
	/** Optional device class (e.g. "door", "temperature", "humidity"). */
	device_class?: string;
	/** Optional unit of measurement (e.g. "°C", "%", "lux"). */
	unit?: string;
	/** Which underlying event stream feeds this entity's state. */
	source: HaEntitySource;
	/** For GPIO-backed entities: the pin number to watch or control. */
	pin?: number;
	/** For binary_sensor entities derived from GPIO: map digital states to HA on/off. */
	state_map?: { high: string; low: string };
	/** For light entities: which light driver this entity controls. */
	light_type?: "pwm" | "ws2812";
	/** For PWM lights: PWM frequency in Hz. */
	pwm_frequency?: number;
	/** For WS2812 lights: number of LEDs in the strip. */
	num_leds?: number;
}

export interface HaDeviceConfig {
	entities: HaEntityDeclaration[];
}

// Props passed to the DeviceSender entrypoint
export interface DeviceSenderProps {
	projectId: string;
	deviceId: string;
}

export type Content = {};

// Backward-compat type aliases — deprecated, use UserWorkerEnv instead

// Lifecycle methods and internal properties excluded from the remote interface
type LifecycleMethods =
	| "onDeviceConnect"
	| "onDeviceDisconnect"
	| "onMessage"
	| "onAlarm"
	| "onCron";
type InternalProps = "env" | "ctx";

/** @deprecated Use UserWorkerEnv instead */
export type RemoteDevice<T> = {
	[K in keyof T as K extends LifecycleMethods | InternalProps
		? never
		: T[K] extends (...args: infer _A) => infer _R
			? K
			: never]: T[K] extends (...args: infer A) => infer R
		? (...args: A) => Promise<Awaited<R>>
		: never;
};

/** @deprecated Use UserWorkerEnv instead */
type RemoteDevices<T> = {
	[K in keyof T]: T[K] extends object ? RemoteDevice<T[K]> : never;
};

/** @deprecated Use UserWorkerEnv instead */
export type GetEnv<ProjectDevices = {}> = UserWorkerEnv<ProjectDevices>;

/**
 * Base class for a DeviceSDK device script. Extend it and export a named class
 * matching the `className` in your `devicesdk.ts`. The runtime calls your
 * lifecycle hooks when the device connects, sends events, or a cron fires.
 *
 * Public methods you define on the subclass (other than the lifecycle hooks)
 * are callable from other devices in the same project as RPC via
 * `this.env.DEVICES["other-slug"].method()`.
 *
 * Your script runs in a sandboxed serverless runtime — **not on the
 * microcontroller and not in Node.js**. Avoid `node:*` imports, filesystem
 * access, and long-running loops; the runtime budgets CPU per event.
 *
 * @example
 * import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";
 *
 * export class Thermostat extends DeviceEntrypoint {
 *   crons = { read: "0 8 * * *" }; // daily at 08:00 UTC
 *
 *   async onCron() {
 *     await this.env.DEVICE.getTemperature();
 *   }
 *
 *   async onMessage(message: DeviceResponse) {
 *     if (message.type === "temperature_result") {
 *       await this.env.DEVICE.kv.put("last_temp", message.payload.celsius);
 *     }
 *   }
 * }
 *
 * @see https://devicesdk.com/docs/concepts/entrypoints/
 */
export class DeviceEntrypoint<Env = UserWorkerEnv> {
	ctx: Content;
	env: Env;

	/**
	 * Named cron schedules for this device script.
	 *
	 * Keys are arbitrary schedule names; values are standard 5-field cron expressions
	 * (minute hour dom month dow, all in UTC). When a cron fires, `onCron` is called
	 * with the matching name.
	 *
	 * Example: `"0 8 * * *"` runs daily at 08:00 UTC; `"0 * * * *"` runs every hour.
	 */
	crons?: Record<string, string>;

	constructor(ctx: Content, env: Env) {
		this.ctx = ctx;
		this.env = env;
	}

	/**
	 * Called when the physical device opens its WebSocket connection to the runtime.
	 * Use this to push initial configuration (set pin modes, configure I2C buses,
	 * subscribe to inputs). Avoid heavy work — the runtime budgets CPU per event.
	 *
	 * Override on your subclass; the default is a no-op.
	 */
	onDeviceConnect() {
		return;
	}

	/**
	 * Called when the device's WebSocket connection drops (clean close, network
	 * loss, or device reboot). Override on your subclass to react; the default
	 * is a no-op. The device will reconnect automatically.
	 */
	onDeviceDisconnect() {
		return;
	}

	/**
	 * Called for every event the device emits over WebSocket — sensor reads,
	 * GPIO transitions, command acks/errors, temperature readings, I2C results.
	 *
	 * `message` is a discriminated union; narrow on `message.type` before
	 * accessing `message.payload`.
	 *
	 * @example
	 * onMessage(message: DeviceResponse) {
	 *   if (message.type === "pin_state_update" && message.payload.mode === "digital") {
	 *     console.log(`pin ${message.payload.pin} = ${message.payload.value}`);
	 *   } else if (message.type === "command_error") {
	 *     console.error(`command ${message.payload.command_type} failed: ${message.payload.error}`);
	 *   }
	 * }
	 */
	onMessage(_message: DeviceResponse) {
		return;
	}

	/**
	 * Called when a named cron defined in `crons` fires.
	 * Override this method to handle scheduled work.
	 *
	 * @param name - The key from the `crons` object that triggered this call.
	 */
	onCron(_name: string) {
		return;
	}
}
