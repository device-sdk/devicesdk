import type { DeviceCommand, DeviceType } from "@devicesdk/core";

/**
 * Minimum firmware version per command type and device type. Commands missing
 * from this map have no recorded minimum and are always allowed.
 *
 * The three sensor commands (DHT11/DHT22 + DS18B20) landed in firmware 0.2.0;
 * older firmware has no handler for them and silently times out after 5
 * seconds, so we gate them server-side with an actionable reflash error.
 */
export const FIRMWARE_MIN_VERSION: Partial<
	Record<DeviceCommand["type"], Partial<Record<DeviceType, string>>>
> = {
	dht_read: {
		"pico-w": "0.2.0",
		"pico2-w": "0.2.0",
		esp32: "0.2.0",
		esp32c3: "0.2.0",
		esp32c61: "0.2.0",
	},
	onewire_search: {
		"pico-w": "0.2.0",
		"pico2-w": "0.2.0",
		esp32: "0.2.0",
		esp32c3: "0.2.0",
		esp32c61: "0.2.0",
	},
	onewire_read_temp: {
		"pico-w": "0.2.0",
		"pico2-w": "0.2.0",
		esp32: "0.2.0",
		esp32c3: "0.2.0",
		esp32c61: "0.2.0",
	},
};

const VERSION_PART = /^[0-9]+$/;

/**
 * Compares two `major.minor.patch` version strings numerically. A
 * `-prerelease` or `+build` suffix is ignored. Missing parts are treated as 0
 * (e.g. "1.2" == "1.2.0"). Returns -1/0/1, or null when either string has a
 * non-numeric part.
 */
export function compareFirmwareVersions(a: string, b: string): number | null {
	const normalize = (v: string): number[] | null => {
		const core = v.split(/[-+]/)[0];
		const parts = core.split(".").map((p) => p.trim());
		if (parts.length > 3) return null;
		const nums: number[] = [];
		for (const part of parts) {
			if (!VERSION_PART.test(part)) return null;
			nums.push(Number(part));
		}
		while (nums.length < 3) nums.push(0);
		return nums;
	};

	const aNums = normalize(a);
	const bNums = normalize(b);
	if (!aNums || !bNums) return null;

	for (let i = 0; i < 3; i++) {
		if (aNums[i] < bNums[i]) return -1;
		if (aNums[i] > bNums[i]) return 1;
	}
	return 0;
}

/**
 * Whether a device with the given type + firmware version can run a command.
 * Returns null when the version is unknown (backward compat - allow) or
 * unparseable, true when the command has no recorded minimum, otherwise
 * whether the reported version is at least the minimum.
 */
export function firmwareSupportsCommand(
	deviceType: string | null,
	firmwareVersion: string | null,
	commandType: string,
): boolean | null {
	if (deviceType === null || firmwareVersion === null) return null;

	const minForType = FIRMWARE_MIN_VERSION[commandType as DeviceCommand["type"]];
	const min = minForType?.[deviceType as DeviceType];
	if (min === undefined) return true;

	const comparison = compareFirmwareVersions(firmwareVersion, min);
	if (comparison === null) return null;
	return comparison >= 0;
}
