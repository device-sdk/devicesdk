import type { DeviceCommand, DeviceResponse } from "@devicesdk/core";

// Interface for the user-defined device worker entrypoint
// User code must export a class that implements these methods
export interface IUserDeviceWorker {
	// Called when the device connects
	onDeviceConnect(): Promise<void>;

	// Called when the device disconnects
	onDeviceDisconnect(): Promise<void>;

	// Called when a message is received from the device
	onMessage(message: DeviceResponse): Promise<void>;

	// Called when the alarm fires (if using alarms)
	onAlarm?(): Promise<void>;

	// Called for inter-device RPC — invokes a user-defined method by name
	callMethod?(
		name: string,
		args: unknown[],
		callDepth?: number,
	): Promise<unknown>;

	// Returns the cron schedule definitions (name → cron expression)
	getCrons?(): Promise<Record<string, string>>;

	// Called when a named cron fires
	onCron?(name: string): Promise<void>;
}

// KV storage interface for user code
export interface KVInterface {
	get<T = unknown>(key: string): Promise<T | undefined>;
	put<T>(key: string, value: T): Promise<void>;
	delete(key: string): Promise<boolean>;
}

// The env that the dynamic worker will receive
export interface UserWorkerEnv {
	// Binding to send messages/commands to the IoT device via the DO
	DEVICE: DeviceSenderInterface;
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

	// Persist a log entry to DO SQLite storage
	persistLog(level: string, message: string): Promise<void>;
}

// Props passed to the DeviceSender entrypoint
export interface DeviceSenderProps {
	projectId: string;
	deviceId: string;
}
