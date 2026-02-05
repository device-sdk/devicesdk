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
	| ConfigureGpioInputMonitoringCommand;

// --- Device Responses ---
interface BaseResponse {
	id: string; // Should match the ID of the command it's responding to.
}

export interface DeviceConnected extends BaseResponse {
	type: "device_connected";
}

export interface PinStateUpdate extends BaseResponse {
	type: "pin_state_update";
	payload: {
		pin: number;
		mode: "analog" | "digital";
		value: number;
	};
}

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

export type DeviceResponse =
	| DeviceConnected
	| PinStateUpdate
	| I2cScanResult
	| I2cReadResult
	| CommandAck
	| CommandError
	| GpioStateChanged;

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
};

// KV storage interface for user code
export interface KVInterface {
	get<T = unknown>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<boolean>;
}

// Logger interface for user code
export interface LoggerInterface {
	debug(...args: unknown[]): void;
	info(...args: unknown[]): void;
	log(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

// The env that the dynamic worker will receive
export type UserWorkerEnv<ProjectDevices = {}> = {
	// Binding to send messages/commands to the IoT device via the DO
	DEVICE: DeviceSenderInterface;

	// Logger binding for logging from user code
	LOGGER: LoggerInterface;

    DEVICES: ProjectDevices
}

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

	// KV storage for persistent state
	kv: KVInterface;
}

// Props passed to the DeviceSender entrypoint
export interface DeviceSenderProps {
	projectId: string;
	deviceId: string;
}

export type Content = {}

export class DeviceEntrypoint<ProjectDevices = {}> {
	ctx: Content
	env: UserWorkerEnv<ProjectDevices>

    constructor(ctx: Content, env: UserWorkerEnv<ProjectDevices>) {
        this.ctx = ctx
        this.env = env
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
	onMessage(message: DeviceResponse) {
		return;
	}
}
