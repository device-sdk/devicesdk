// ---- Home Assistant integration types ----
// These types describe the entity declarations users can add to `devicesdk.ts`
// under the `ha` key, and are uploaded to the API on deploy for consumption
// by the Home Assistant custom integration.

export type HaEntityType =
	| "binary_sensor"
	| "sensor"
	| "switch"
	| "light"
	| "number";

export type HaEntitySource =
	| "gpio_state_changed"
	| "pin_state_update"
	| "temperature_result"
	| "user";

export interface HaEntityDeclaration {
	/** Stable ID unique within the device, e.g. "front_door", "soil_moisture". */
	entity_id: string;
	/** Home Assistant platform the entity maps to. */
	type: HaEntityType;
	/** Human-readable name shown in the Home Assistant UI. */
	name: string;
	/** Optional device class (e.g. "door", "temperature", "humidity"). */
	device_class?: string;
	/** Optional unit of measurement (e.g. "°C", "%", "lux"). */
	unit?: string;
	/** Which underlying event stream feeds this entity's state. */
	source: HaEntitySource;
	/** For GPIO-backed entities: the pin number to watch or control. */
	pin?: number;
	/** For binary_sensor entities derived from GPIO: map digital states to HA on/off. */
	state_map?: { high: string; low: string };
	/** For light entities: which light driver this entity controls. */
	light_type?: "pwm" | "ws2812";
	/** For PWM lights: PWM frequency in Hz. */
	pwm_frequency?: number;
	/** For WS2812 lights: number of LEDs in the strip. */
	num_leds?: number;
}

export interface HaDeviceConfig {
	entities: HaEntityDeclaration[];
}
