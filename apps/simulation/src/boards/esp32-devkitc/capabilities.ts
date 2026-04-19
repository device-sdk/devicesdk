import type { PinCapability } from "../types";

function gpio(extra: Partial<PinCapability> = {}): PinCapability {
	return { digital: "io", pwm: true, ...extra };
}

function inputOnly(extra: Partial<PinCapability> = {}): PinCapability {
	return { digital: "in", pwm: false, ...extra };
}

export const ESP32_CAPABILITIES: Record<number, PinCapability> = {
	0: gpio({
		adc: { unit: 2, channel: 1 },
		touch: 1,
		strapping: true,
	}),
	1: gpio({ uart: { port: 0, role: "tx" } }),
	2: gpio({
		adc: { unit: 2, channel: 2 },
		touch: 2,
		strapping: true,
	}),
	3: gpio({ uart: { port: 0, role: "rx" } }),
	4: gpio({
		adc: { unit: 2, channel: 0 },
		touch: 0,
	}),
	5: gpio({
		spi: { bus: "vspi", role: "cs" },
		strapping: true,
	}),
	6: gpio({ flashReserved: true }),
	7: gpio({ flashReserved: true }),
	8: gpio({ flashReserved: true }),
	9: gpio({ flashReserved: true }),
	10: gpio({ flashReserved: true }),
	11: gpio({ flashReserved: true }),
	12: gpio({
		adc: { unit: 2, channel: 5 },
		touch: 5,
		spi: { bus: "hspi", role: "miso" },
		strapping: true,
	}),
	13: gpio({
		adc: { unit: 2, channel: 4 },
		touch: 4,
		spi: { bus: "hspi", role: "mosi" },
	}),
	14: gpio({
		adc: { unit: 2, channel: 6 },
		touch: 6,
		spi: { bus: "hspi", role: "clk" },
	}),
	15: gpio({
		adc: { unit: 2, channel: 3 },
		touch: 3,
		spi: { bus: "hspi", role: "cs" },
		strapping: true,
	}),
	16: gpio({ uart: { port: 2, role: "rx" } }),
	17: gpio({ uart: { port: 2, role: "tx" } }),
	18: gpio({ spi: { bus: "vspi", role: "clk" } }),
	19: gpio({ spi: { bus: "vspi", role: "miso" } }),
	21: gpio({ i2cDefault: "sda" }),
	22: gpio({ i2cDefault: "scl" }),
	23: gpio({ spi: { bus: "vspi", role: "mosi" } }),
	25: gpio({ adc: { unit: 2, channel: 8 }, dac: true }),
	26: gpio({ adc: { unit: 2, channel: 9 }, dac: true }),
	27: gpio({ adc: { unit: 2, channel: 7 }, touch: 7 }),
	32: gpio({ adc: { unit: 1, channel: 4 }, touch: 9 }),
	33: gpio({ adc: { unit: 1, channel: 5 }, touch: 8 }),
	34: inputOnly({ adc: { unit: 1, channel: 6 } }),
	35: inputOnly({ adc: { unit: 1, channel: 7 } }),
	36: inputOnly({ adc: { unit: 1, channel: 0 } }),
	39: inputOnly({ adc: { unit: 1, channel: 3 } }),
};

export function getCapability(gpioNum: number): PinCapability | null {
	return ESP32_CAPABILITIES[gpioNum] ?? null;
}

export function supportsAnalog(gpioNum: number): boolean {
	return !!getCapability(gpioNum)?.adc;
}

export function supportsPwm(gpioNum: number): boolean {
	return !!getCapability(gpioNum)?.pwm;
}

export function supportsOutput(gpioNum: number): boolean {
	return getCapability(gpioNum)?.digital === "io";
}

export function isStrapping(gpioNum: number): boolean {
	return !!getCapability(gpioNum)?.strapping;
}

export function isFlashReserved(gpioNum: number): boolean {
	return !!getCapability(gpioNum)?.flashReserved;
}

export function describeFunctions(gpioNum: number): string[] {
	const cap = getCapability(gpioNum);
	if (!cap) return [];
	const parts: string[] = [];
	if (cap.adc) parts.push(`ADC${cap.adc.unit}_CH${cap.adc.channel}`);
	if (cap.dac) parts.push(gpioNum === 25 ? "DAC1" : "DAC2");
	if (cap.touch !== undefined) parts.push(`TOUCH${cap.touch}`);
	if (cap.spi)
		parts.push(`${cap.spi.bus.toUpperCase()} ${cap.spi.role.toUpperCase()}`);
	if (cap.uart)
		parts.push(`UART${cap.uart.port} ${cap.uart.role.toUpperCase()}`);
	if (cap.i2cDefault) parts.push(`I2C ${cap.i2cDefault.toUpperCase()}`);
	return parts;
}
