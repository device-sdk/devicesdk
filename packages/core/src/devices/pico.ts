/**
 * Pico W / Pico 2W I2C type hints
 *
 * Provides full type safety for valid I2C pin combinations.
 * Both Pico W (RP2040) and Pico 2W (RP2350) share the same pinout.
 */

import type { I2cConfigureCommand } from "../index.js";

// Valid I2C0 pin configurations
export type PicoI2c0Pins =
	| { bus: 0; sda_pin: 0; scl_pin: 1 }
	| { bus: 0; sda_pin: 4; scl_pin: 5 }
	| { bus: 0; sda_pin: 8; scl_pin: 9 }
	| { bus: 0; sda_pin: 12; scl_pin: 13 }
	| { bus: 0; sda_pin: 16; scl_pin: 17 }
	| { bus: 0; sda_pin: 20; scl_pin: 21 };

// Valid I2C1 pin configurations
export type PicoI2c1Pins =
	| { bus: 1; sda_pin: 2; scl_pin: 3 }
	| { bus: 1; sda_pin: 6; scl_pin: 7 }
	| { bus: 1; sda_pin: 10; scl_pin: 11 }
	| { bus: 1; sda_pin: 14; scl_pin: 15 }
	| { bus: 1; sda_pin: 18; scl_pin: 19 }
	| { bus: 1; sda_pin: 26; scl_pin: 27 };

// All valid Pico I2C configurations
export type PicoI2cPins = PicoI2c0Pins | PicoI2c1Pins;

// I2C configuration with optional frequency
export type PicoI2cConfig = PicoI2cPins & {
	frequency?: number;
};

/**
 * Create a type-safe I2C configure command for Pico W / Pico 2W
 *
 * @example
 * ```typescript
 * import { Pico } from '@devicesdk/core/devices/pico';
 *
 * // TypeScript will autocomplete valid pin combinations
 * const cmd = Pico.i2c({ bus: 0, sda_pin: 0, scl_pin: 1 });
 *
 * // This would be a type error:
 * // const cmd = Pico.i2c({ bus: 0, sda_pin: 2, scl_pin: 3 }); // Error!
 *
 * await device.sendCommand(cmd);
 * ```
 */
export const Pico = {
	/**
	 * Create an I2C configure command with validated pin combinations
	 */
	i2c(config: PicoI2cConfig): Omit<I2cConfigureCommand, "id"> {
		return {
			type: "i2c_configure",
			payload: {
				bus: config.bus,
				sda_pin: config.sda_pin,
				scl_pin: config.scl_pin,
				frequency: config.frequency,
			},
		};
	},
};

// Re-export for convenience
export type { I2cConfigureCommand };
