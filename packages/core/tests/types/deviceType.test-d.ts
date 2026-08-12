import { describe, expectTypeOf, it } from "vitest";
import type { DeviceType } from "../../src/index.js";
import { DEVICE_TYPES } from "../../src/index.js";

describe("DeviceType", () => {
	it("DEVICE_TYPES array exactly covers the DeviceType union", () => {
		expectTypeOf<DeviceType>().toEqualTypeOf<(typeof DEVICE_TYPES)[number]>();
	});

	it("every known device type is assignable to DeviceType", () => {
		expectTypeOf<"pico-w">().toMatchTypeOf<DeviceType>();
		expectTypeOf<"pico2-w">().toMatchTypeOf<DeviceType>();
		expectTypeOf<"esp32">().toMatchTypeOf<DeviceType>();
		expectTypeOf<"esp32c61">().toMatchTypeOf<DeviceType>();
		expectTypeOf<"esp32c3">().toMatchTypeOf<DeviceType>();
	});

	it("DEVICE_TYPES is a readonly tuple of DeviceType", () => {
		expectTypeOf(DEVICE_TYPES).toEqualTypeOf<
			readonly ["pico-w", "pico2-w", "esp32", "esp32c61", "esp32c3"]
		>();
	});
});
