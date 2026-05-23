import { describe, expectTypeOf, it } from "vitest";
import type {
	DeviceCommand,
	DeviceResponse,
	I2cBatchWriteCommand,
	PinStateUpdate,
	RebootCommand,
} from "../../src/index.js";

describe("DeviceCommand discriminated union", () => {
	it("narrows by `type` to the matching command shape", () => {
		const cmd: DeviceCommand = {
			id: "1",
			type: "reboot",
			payload: {},
		};
		if (cmd.type === "reboot") {
			expectTypeOf(cmd).toEqualTypeOf<RebootCommand>();
		}
	});

	it("i2c_batch_write payload requires bus, address, writes", () => {
		expectTypeOf<I2cBatchWriteCommand["payload"]>().toMatchObjectType<{
			bus: number;
			address: string;
			writes: string[][];
		}>();
	});
});

describe("PinStateUpdate discriminated by payload.mode", () => {
	it("digital mode narrows value to 'high' | 'low'", () => {
		const update: PinStateUpdate = {
			id: "1",
			type: "pin_state_update",
			payload: { pin: 1, mode: "digital", value: "high" },
		};
		if (update.payload.mode === "digital") {
			expectTypeOf(update.payload.value).toEqualTypeOf<"high" | "low">();
		}
	});

	it("analog mode narrows value to number", () => {
		const update: PinStateUpdate = {
			id: "1",
			type: "pin_state_update",
			payload: { pin: 1, mode: "analog", value: 1234 },
		};
		if (update.payload.mode === "analog") {
			expectTypeOf(update.payload.value).toEqualTypeOf<number>();
		}
	});
});

describe("DeviceResponse union", () => {
	it("includes pin_state_update among its members", () => {
		const r: DeviceResponse = {
			id: "1",
			type: "pin_state_update",
			payload: { pin: 1, mode: "digital", value: "low" },
		};
		expectTypeOf(r).toMatchTypeOf<DeviceResponse>();
	});
});
