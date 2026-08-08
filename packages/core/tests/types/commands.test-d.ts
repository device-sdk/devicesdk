import { describe, expectTypeOf, it } from "vitest";
import type {
	CommandResponseTypeMap,
	DeviceCommand,
	DeviceResponse,
	DhtReadCommand,
	DhtReadResult,
	I2cBatchWriteCommand,
	OnewireReadTempCommand,
	OnewireSearchCommand,
	OnewireSearchResult,
	OnewireTempResult,
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

describe("OneWire and DHT commands", () => {
	it("narrows onewire_read_temp to its command shape", () => {
		const cmd: DeviceCommand = {
			id: "1",
			type: "onewire_read_temp",
			payload: { pin: 4, rom: "28FF641E8D3C4A41" },
		};
		if (cmd.type === "onewire_read_temp") {
			expectTypeOf(cmd).toEqualTypeOf<OnewireReadTempCommand>();
			expectTypeOf(cmd.payload.rom).toEqualTypeOf<string | undefined>();
		}
	});

	it("onewire_search and dht_read are members of DeviceCommand", () => {
		expectTypeOf<OnewireSearchCommand>().toMatchTypeOf<DeviceCommand>();
		expectTypeOf<DhtReadCommand>().toMatchTypeOf<DeviceCommand>();
	});

	it("dht_read model is restricted to the supported sensors", () => {
		expectTypeOf<DhtReadCommand["payload"]["model"]>().toEqualTypeOf<
			"dht11" | "dht22"
		>();
	});

	it("maps the new command types to their response types", () => {
		expectTypeOf<
			CommandResponseTypeMap["onewire_search"]
		>().toEqualTypeOf<OnewireSearchResult>();
		expectTypeOf<
			CommandResponseTypeMap["onewire_read_temp"]
		>().toEqualTypeOf<OnewireTempResult>();
		expectTypeOf<
			CommandResponseTypeMap["dht_read"]
		>().toEqualTypeOf<DhtReadResult>();
	});

	it("includes the new results in the DeviceResponse union", () => {
		const r: DeviceResponse = {
			id: "1",
			type: "dht_read_result",
			payload: { pin: 15, celsius: 21.5, humidity_pct: 45 },
		};
		expectTypeOf(r).toMatchTypeOf<DeviceResponse>();
	});
});
