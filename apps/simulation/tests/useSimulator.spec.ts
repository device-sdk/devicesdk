import type { DeviceCommand } from "@devicesdk/core";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useSimulator } from "../src/composables/useSimulator";

function command(
	type: string,
	payload: Record<string, unknown>,
): DeviceCommand {
	return { id: "msg-1", type, payload } as DeviceCommand;
}

describe("useSimulator - onewire/dht commands", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("answers onewire_search with the canned ROM", () => {
		const { handleDeviceCommand } = useSimulator();
		const reply = handleDeviceCommand(command("onewire_search", { pin: 4 }));
		expect(reply?.type).toBe("onewire_search_result");
		expect(reply?.payload).toEqual({
			pin: 4,
			roms: ["28FF641E8D3C4A41"],
		});
	});

	it("answers a Skip ROM read with an empty rom string", () => {
		const { handleDeviceCommand } = useSimulator();
		const reply = handleDeviceCommand(command("onewire_read_temp", { pin: 4 }));
		expect(reply?.type).toBe("onewire_temp_result");
		expect(reply?.payload).toMatchObject({ pin: 4, rom: "" });
		expect(typeof (reply?.payload as { celsius: number }).celsius).toBe(
			"number",
		);
	});

	it("echoes the addressed rom on a multi-drop read", () => {
		const { handleDeviceCommand } = useSimulator();
		const reply = handleDeviceCommand(
			command("onewire_read_temp", {
				pin: 4,
				rom: "28FF641E8D3C4A41",
			}),
		);
		expect(reply?.type).toBe("onewire_temp_result");
		expect((reply?.payload as { rom: string }).rom).toBe("28FF641E8D3C4A41");
	});

	it("rejects a malformed rom with a command_error, like the firmwares", () => {
		const { handleDeviceCommand } = useSimulator();
		const reply = handleDeviceCommand(
			command("onewire_read_temp", { pin: 4, rom: "28FF" }),
		);
		expect(reply?.type).toBe("command_error");
		expect((reply?.payload as { error: string }).error).toMatch(/Invalid rom/);
	});

	it("rejects a lowercase rom, like the firmwares", () => {
		const { handleDeviceCommand } = useSimulator();
		const reply = handleDeviceCommand(
			command("onewire_read_temp", { pin: 4, rom: "28ff641e8d3c4a41" }),
		);
		expect(reply?.type).toBe("command_error");
	});

	it("answers dht_read with temperature and humidity", () => {
		const { handleDeviceCommand } = useSimulator();
		const reply = handleDeviceCommand(
			command("dht_read", { pin: 15, model: "dht22" }),
		);
		expect(reply?.type).toBe("dht_read_result");
		expect(reply?.payload).toMatchObject({ pin: 15 });
		const { celsius, humidity_pct } = reply?.payload as {
			celsius: number;
			humidity_pct: number;
		};
		expect(typeof celsius).toBe("number");
		expect(typeof humidity_pct).toBe("number");
	});
});
