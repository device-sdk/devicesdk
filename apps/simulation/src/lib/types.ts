import type { DeviceCommand } from "@devicesdk/core";

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

export interface PinType {
	id: number;
	gpio: number | null;
	name: string;
	position: { top: string; left?: string; right?: string };
	functions: string[];
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

export type Protocol = "SPI" | "I2C" | "UART" | "ADC";

export type SensorType = "DHT22" | "Push Button" | "SSD1306 OLED";

export interface SensorInfo {
	name: SensorType;
	protocol: Protocol;
	pins: { [key: string]: string };
}

export interface ConnectedSensor {
	type: SensorType;
	pins: { [key: string]: number };
}
