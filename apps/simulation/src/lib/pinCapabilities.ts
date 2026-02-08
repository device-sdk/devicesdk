export interface I2cCapability {
	bus: 0 | 1;
	role: "sda" | "scl";
}

export interface PinCapabilities {
	digital: boolean;
	adc: boolean;
	pwm: boolean;
	i2c: I2cCapability[];
}

// Valid I2C pairs from @devicesdk/core/devices/pico:
// I2C0: (0,1), (4,5), (8,9), (12,13), (16,17), (20,21)
// I2C1: (2,3), (6,7), (10,11), (14,15), (18,19), (26,27)
// ADC: GPIO 26 (ADC0), 27 (ADC1), 28 (ADC2)

function gpio(opts: { adc?: boolean; i2c?: I2cCapability[] }): PinCapabilities {
	return {
		digital: true,
		adc: opts.adc ?? false,
		pwm: true,
		i2c: opts.i2c ?? [],
	};
}

export const PIN_CAPABILITIES: Record<number, PinCapabilities> = {
	0: gpio({ i2c: [{ bus: 0, role: "sda" }] }),
	1: gpio({ i2c: [{ bus: 0, role: "scl" }] }),
	2: gpio({ i2c: [{ bus: 1, role: "sda" }] }),
	3: gpio({ i2c: [{ bus: 1, role: "scl" }] }),
	4: gpio({ i2c: [{ bus: 0, role: "sda" }] }),
	5: gpio({ i2c: [{ bus: 0, role: "scl" }] }),
	6: gpio({ i2c: [{ bus: 1, role: "sda" }] }),
	7: gpio({ i2c: [{ bus: 1, role: "scl" }] }),
	8: gpio({ i2c: [{ bus: 0, role: "sda" }] }),
	9: gpio({ i2c: [{ bus: 0, role: "scl" }] }),
	10: gpio({ i2c: [{ bus: 1, role: "sda" }] }),
	11: gpio({ i2c: [{ bus: 1, role: "scl" }] }),
	12: gpio({ i2c: [{ bus: 0, role: "sda" }] }),
	13: gpio({ i2c: [{ bus: 0, role: "scl" }] }),
	14: gpio({ i2c: [{ bus: 1, role: "sda" }] }),
	15: gpio({ i2c: [{ bus: 1, role: "scl" }] }),
	16: gpio({ i2c: [{ bus: 0, role: "sda" }] }),
	17: gpio({ i2c: [{ bus: 0, role: "scl" }] }),
	18: gpio({ i2c: [{ bus: 1, role: "sda" }] }),
	19: gpio({ i2c: [{ bus: 1, role: "scl" }] }),
	20: gpio({ i2c: [{ bus: 0, role: "sda" }] }),
	21: gpio({ i2c: [{ bus: 0, role: "scl" }] }),
	22: gpio({}),
	26: gpio({ adc: true, i2c: [{ bus: 1, role: "sda" }] }),
	27: gpio({ adc: true, i2c: [{ bus: 1, role: "scl" }] }),
	28: gpio({ adc: true }),
};

/** All valid I2C pin pairs for the Pico. */
export const VALID_I2C_PAIRS: {
	bus: number;
	sda: number;
	scl: number;
}[] = [
	// I2C0
	{ bus: 0, sda: 0, scl: 1 },
	{ bus: 0, sda: 4, scl: 5 },
	{ bus: 0, sda: 8, scl: 9 },
	{ bus: 0, sda: 12, scl: 13 },
	{ bus: 0, sda: 16, scl: 17 },
	{ bus: 0, sda: 20, scl: 21 },
	// I2C1
	{ bus: 1, sda: 2, scl: 3 },
	{ bus: 1, sda: 6, scl: 7 },
	{ bus: 1, sda: 10, scl: 11 },
	{ bus: 1, sda: 14, scl: 15 },
	{ bus: 1, sda: 18, scl: 19 },
	{ bus: 1, sda: 26, scl: 27 },
];

/** Find the I2C bus for a given SDA/SCL pin pair, or null if invalid. */
export function findI2cBus(
	sdaPin: number,
	sclPin: number,
): { bus: number } | null {
	const pair = VALID_I2C_PAIRS.find(
		(p) => p.sda === sdaPin && p.scl === sclPin,
	);
	return pair ? { bus: pair.bus } : null;
}

/** Get a human-readable description of what I2C roles a pin can serve. */
export function describeI2cCapabilities(gpioNum: number): string[] {
	const caps = PIN_CAPABILITIES[gpioNum];
	if (!caps) return [];
	return caps.i2c.map((c) => `I2C${c.bus} ${c.role.toUpperCase()}`);
}
