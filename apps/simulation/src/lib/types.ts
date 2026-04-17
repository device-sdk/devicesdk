import type { DeviceCommand, DisplayUpdateCommand } from "@devicesdk/core";

export type { DisplayUpdateCommand };

export type PinMode =
	| "digital_input"
	| "digital_output"
	| "analog_input"
	| "pwm_output";

export interface PwmConfig {
	frequency: number;
	dutyCycle: number;
}

export interface AnalogReading {
	voltage: number;
	raw: number;
}

export interface InputMonitoring {
	enabled: boolean;
	pull: "up" | "down" | "none";
}

export interface PinState {
	mode: PinMode;
	digitalState: "high" | "low";
	pwm?: PwmConfig;
	analog?: AnalogReading;
	monitoring?: InputMonitoring;
}

export interface LogEntry {
	timestamp: string;
	message: string;
	commandType?: DeviceCommand["type"];
}
