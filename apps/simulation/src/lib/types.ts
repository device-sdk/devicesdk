import type { DeviceCommand, DisplayUpdateCommand } from "@devicesdk/core";
import type { PinMode } from "@/boards/types";

export type { DisplayUpdateCommand, PinMode };

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
