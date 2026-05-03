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

// KV storage interface for user code
export interface KVInterface {
	get<T = unknown>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<boolean>;
}

// Environment variables interface for user code
export interface EnvVarsInterface {
	get(key: string): Promise<string | undefined>;
	getAll(): Promise<Record<string, string>>;
}

// The env that the dynamic worker will receive
export type UserWorkerEnv<ProjectDevices = {}> = {
	// Binding to send messages/commands to the IoT device via the DO
	DEVICE: DeviceSenderInterface;

	DEVICES: ProjectDevices;

	// Project-scoped environment variables
	VARS: EnvVarsInterface;
};

// Interface for the DeviceSender binding provided to user code
export interface DeviceSenderInterface {
	// Send a command to the device without waiting for response
	sendCommand(command: Omit<DeviceCommand, "id">): Promise<void>;

	// Send a command and wait for the device's response
	sendCommandAndWait<T extends DeviceCommand>(
		command: Omit<T, "id">,
	): Promise<DeviceResponse>;

	// Convenience methods matching BaseDevice's API
	reboot(): Promise<void>;
	setGpioState(pin: number, state: "high" | "low"): Promise<void>;
	setPwmState(pin: number, frequency: number, dutyCycle: number): Promise<void>;
	getPinState(pin: number, mode: "analog" | "digital"): Promise<DeviceResponse>;
	i2cScan(bus: number): Promise<DeviceResponse>;
	i2cWrite(bus: number, address: string, data: string[]): Promise<void>;
	i2cRead(
		bus: number,
		address: string,
		bytesToRead: number,
		registerToRead?: string,
	): Promise<DeviceResponse>;
	configureGpioInputMonitoring(
		pin: number,
		enable: boolean,
		pull?: "up" | "down" | "none",
	): Promise<void>;

	// Temperature sensor
	getTemperature(): Promise<DeviceResponse>;

	// Watchdog timer
	watchdogConfigure(timeoutMs: number, enable: boolean): Promise<void>;
	watchdogFeed(): Promise<void>;

	// SPI
	spiConfigure(
		bus: number,
		clkPin: number,
		mosiPin: number,
		misoPin: number,
		csPin: number,
		frequency: number,
		mode: 0 | 1 | 2 | 3,
	): Promise<void>;
	spiTransfer(bus: number, data: string[]): Promise<DeviceResponse>;
	spiWrite(bus: number, data: string[]): Promise<void>;
	spiRead(bus: number, bytesToRead: number): Promise<DeviceResponse>;

	// UART
	uartConfigure(
		port: number,
		txPin: number,
		rxPin: number,
		baudRate: number,
		dataBits?: 5 | 6 | 7 | 8,
		stopBits?: 1 | 2,
		parity?: "none" | "even" | "odd",
	): Promise<void>;
	uartWrite(port: number, data: string[]): Promise<void>;
	uartRead(
		port: number,
		bytesToRead: number,
		timeoutMs?: number,
	): Promise<DeviceResponse>;

	// PIO (Pico only)
	pioWs2812Configure(pin: number, numLeds: number): Promise<void>;
	pioWs2812Update(pixels: [number, number, number][]): Promise<void>;

	// KV storage for persistent state
	kv: KVInterface;

	// Persist a log entry to DO SQLite storage
	persistLog(level: string, message: string): Promise<void>;

	// Emit a structured state event to real-time watchers (dashboard, Home Assistant).
	// Use this to expose custom telemetry (ADC readings, I2C sensors, computed values)
	// as entities in external integrations. The `entityId` must match a declared
	// entity in `devicesdk.ts` if you want it surfaced in Home Assistant.
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

	// Called when the device connects
	onDeviceConnect() {
		return;
	}

	// Called when the device disconnects
	onDeviceDisconnect() {
		return;
	}

	// Called when a message is received from the device
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
