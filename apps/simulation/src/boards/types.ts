export type PinKind =
	| "gpio"
	| "input-only"
	| "power-3v3"
	| "power-5v"
	| "power-vin"
	| "ground"
	| "enable";

export type PinAttribute =
	| "strapping"
	| "flash-reserved"
	| "usb-serial"
	| "boot-button"
	| "builtin-led";

export interface PinDef {
	physical: number;
	gpio: number | null;
	label: string;
	shortLabel: string;
	side: "left" | "right";
	row: number;
	kind: PinKind;
	attributes: PinAttribute[];
	functions: string[];
}

export interface AdcChannel {
	unit: 1 | 2;
	channel: number;
}

export interface SpiRole {
	bus: "hspi" | "vspi";
	role: "mosi" | "miso" | "clk" | "cs";
}

export interface UartRole {
	port: 0 | 1 | 2;
	role: "tx" | "rx";
}

export interface PinCapability {
	digital: "io" | "in";
	pwm: boolean;
	adc?: AdcChannel;
	dac?: boolean;
	touch?: number;
	spi?: SpiRole;
	uart?: UartRole;
	i2cDefault?: "sda" | "scl";
	strapping?: boolean;
	flashReserved?: boolean;
}

export type PinMode =
	| "digital_input"
	| "digital_output"
	| "analog_input"
	| "pwm_output";

export interface BoardDef {
	id: string;
	name: string;
	description: string;
	pins: PinDef[];
	capabilities: Record<number, PinCapability>;
	defaultI2c: { sda: number; scl: number };
	defaultSpi: { mosi: number; miso: number; clk: number; cs: number };
	rowCount: number;
}
