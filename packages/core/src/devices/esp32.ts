/**
 * ESP32 type hints - pin literal unions for the ESP32 family of chips.
 *
 * DeviceSDK supports three ESP32 variants today: classic ESP32 (DevKitC),
 * ESP32-C3 (DevKitM-1), and ESP32-C61 (DevKitC-1). Each has a different set
 * of usable GPIOs; this module exports the safe set per chip plus
 * pre-narrowed unions for ADC and onboard-LED-via-WS2812.
 *
 * @example
 * import { OnboardLED, type Esp32C3GpioPin } from "@devicesdk/core/devices/esp32";
 *
 * await this.env.DEVICE.setGpioState(OnboardLED, "high");
 *
 * const safe: Esp32C3GpioPin = 4;   // ok
 * // const bad: Esp32C3GpioPin = 30; // compile error - out of range
 */

export { OnboardLED } from "../index.js";

/**
 * Safe-to-use GPIOs on the classic ESP32 (DevKitC). Excludes pins reserved
 * for flash (6–11), strapping pins that are unsafe at boot (0, 2, 12, 15),
 * and input-only pins (34–39 are listed separately as {@link Esp32InputOnlyPin}).
 * Pin 99 is the virtual onboard-LED pin.
 */
export type Esp32GpioPin =
	| 1
	| 3
	| 4
	| 5
	| 13
	| 14
	| 16
	| 17
	| 18
	| 19
	| 21
	| 22
	| 23
	| 25
	| 26
	| 27
	| 32
	| 33
	| 99;

/** Input-only GPIOs on the classic ESP32. */
export type Esp32InputOnlyPin = 34 | 35 | 36 | 37 | 38 | 39;

/** ADC-capable GPIOs on the classic ESP32 (ADC1; ADC2 is unusable when WiFi is on). */
export type Esp32AdcPin = 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39;

/**
 * Safe GPIOs on ESP32-C3 (DevKitM-1). The onboard WS2812 LED is on GPIO 8 -
 * use {@link OnboardLED} (pin 99) for portable code; setting GPIO 8 directly
 * doesn't drive the LED. Pin 99 is the virtual onboard-LED pin.
 */
export type Esp32C3GpioPin =
	| 0
	| 1
	| 2
	| 3
	| 4
	| 5
	| 6
	| 7
	| 8
	| 9
	| 10
	| 18
	| 19
	| 20
	| 21
	| 99;

/** ADC-capable GPIOs on ESP32-C3. */
export type Esp32C3AdcPin = 0 | 1 | 2 | 3 | 4;

/**
 * Safe GPIOs on ESP32-C61 (DevKitC-1). The onboard WS2812 LED is on GPIO 5 -
 * use {@link OnboardLED} (pin 99) for portable code. Pin 99 is the virtual
 * onboard-LED pin.
 */
export type Esp32C61GpioPin =
	| 0
	| 1
	| 2
	| 3
	| 4
	| 5
	| 6
	| 7
	| 8
	| 9
	| 10
	| 11
	| 12
	| 13
	| 14
	| 15
	| 16
	| 17
	| 18
	| 19
	| 20
	| 21
	| 22
	| 23
	| 24
	| 99;

/** ADC-capable GPIOs on ESP32-C61. */
export type Esp32C61AdcPin = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
