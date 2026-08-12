import { beforeEach, describe, expect, test } from "bun:test";
import type { DeviceCommand, DeviceResponse } from "@devicesdk/core";
import { LocalDeviceSender, type SenderTransport } from "./deviceSender";

/**
 * Records the commands a sender emits and answers waits with a canned frame,
 * so the tests assert on the wire payload without a device or a socket.
 */
class RecordingTransport implements SenderTransport {
	readonly sent: DeviceCommand[] = [];

	sendCommandWithoutAck(command: DeviceCommand): void {
		this.sent.push(command);
	}

	async sendCommandAndWaitForResponse(
		command: DeviceCommand,
	): Promise<DeviceResponse> {
		this.sent.push(command);
		return {
			id: command.id,
			type: "command_ack",
			payload: { command_type: command.type },
		} as DeviceResponse;
	}

	async kvGet<T = unknown>(): Promise<T | undefined> {
		return undefined;
	}
	async kvPut(): Promise<void> {}
	async kvDelete(): Promise<boolean> {
		return false;
	}
	persistLog(): void {}
	emitState(): void {}
	getFirmwareInfo(): {
		firmwareVersion: string | null;
		deviceType: string | null;
	} {
		return { firmwareVersion: null, deviceType: null };
	}
}

/**
 * Transport that reports a fixed firmware version + device type, so the
 * sender's firmware gate can be exercised without a device or a socket.
 */
class FirmwareTransport extends RecordingTransport {
	constructor(
		private readonly firmwareVersion: string | null,
		private readonly deviceType: string | null,
	) {
		super();
	}

	override getFirmwareInfo(): {
		firmwareVersion: string | null;
		deviceType: string | null;
	} {
		return {
			firmwareVersion: this.firmwareVersion,
			deviceType: this.deviceType,
		};
	}
}

let transport: RecordingTransport;
let sender: LocalDeviceSender;

beforeEach(() => {
	transport = new RecordingTransport();
	sender = new LocalDeviceSender(transport);
});

describe("onewireSearch", () => {
	test("sends an onewire_search command carrying the pin", async () => {
		await sender.onewireSearch(4);
		expect(transport.sent).toHaveLength(1);
		expect(transport.sent[0].type).toBe("onewire_search");
		expect(transport.sent[0].payload).toEqual({ pin: 4 });
	});

	test("rejects an out-of-range pin before it reaches the device", async () => {
		await expect(sender.onewireSearch(-1)).rejects.toThrow(/invalid pin/);
		expect(transport.sent).toHaveLength(0);
	});

	test("rejects pins the firmwares cannot use for sensors", async () => {
		// Sensor pins are capped at 28 (the Pico's GPIO range); higher pins get
		// a firmware round-trip on the ESP32 (which allows more) and must fail
		// here with an actionable error instead of a silent 5 s timeout. The
		// Pico-W-only WiFi pins 23-25 are the Pico firmware's job to reject.
		for (const pin of [29, 99, 100]) {
			await expect(sender.onewireSearch(pin)).rejects.toThrow(/invalid pin/);
		}
		expect(transport.sent).toHaveLength(0);
	});

	test("rejects fractional pins rather than truncating them", async () => {
		await expect(sender.onewireSearch(4.5)).rejects.toThrow(/invalid pin/);
		expect(transport.sent).toHaveLength(0);
	});

	test("accepts the highest usable pin", async () => {
		await sender.onewireSearch(28);
		expect(transport.sent[0].payload).toEqual({ pin: 28 });
	});
});

describe("onewireReadTemperature", () => {
	test("omits rom entirely when reading with Skip ROM", async () => {
		await sender.onewireReadTemperature(4);
		expect(transport.sent[0].payload).toEqual({ pin: 4 });
	});

	test("passes a valid ROM code through untouched", async () => {
		await sender.onewireReadTemperature(4, "28FF641E8D3C4A41");
		expect(transport.sent[0].payload).toEqual({
			pin: 4,
			rom: "28FF641E8D3C4A41",
		});
	});

	test("rejects a malformed ROM code", async () => {
		await expect(sender.onewireReadTemperature(4, "xyz")).rejects.toThrow(
			/invalid rom/,
		);
		expect(transport.sent).toHaveLength(0);
	});

	test("rejects a lowercase ROM code (the wire format is uppercase)", async () => {
		await expect(
			sender.onewireReadTemperature(4, "28ff641e8d3c4a41"),
		).rejects.toThrow(/invalid rom/);
	});

	test("throws with an actionable invalid_argument code", async () => {
		try {
			await sender.onewireReadTemperature(4, "28FF");
			throw new Error("expected a validation failure");
		} catch (error) {
			expect((error as Error & { code?: string }).code).toBe(
				"invalid_argument",
			);
		}
	});
});

describe("dhtRead", () => {
	test("sends the model alongside the pin", async () => {
		await sender.dhtRead(15, "dht22");
		expect(transport.sent[0].type).toBe("dht_read");
		expect(transport.sent[0].payload).toEqual({ pin: 15, model: "dht22" });
	});

	test("accepts dht11", async () => {
		await sender.dhtRead(15, "dht11");
		expect(transport.sent[0].payload).toEqual({ pin: 15, model: "dht11" });
	});

	test("rejects an unknown model at runtime", async () => {
		await expect(
			sender.dhtRead(15, "dht12" as "dht11" | "dht22"),
		).rejects.toThrow(/invalid model/);
		expect(transport.sent).toHaveLength(0);
	});

	test("rejects a sensor pin above the platform cap", async () => {
		await expect(sender.dhtRead(99, "dht22")).rejects.toThrow(/invalid pin/);
		expect(transport.sent).toHaveLength(0);
	});
});

describe("firmware version gate", () => {
	test.each([
		"dht_read",
		"onewire_search",
		"onewire_read_temp",
	])("%s fails fast on firmware older than 0.2.0", async (commandType) => {
		const oldTransport = new FirmwareTransport("0.1.0", "esp32c3");
		const oldSender = new LocalDeviceSender(oldTransport);
		const pin = 4;
		const call =
			commandType === "dht_read"
				? oldSender.dhtRead(pin, "dht22")
				: commandType === "onewire_search"
					? oldSender.onewireSearch(pin)
					: oldSender.onewireReadTemperature(pin);
		await expect(call).rejects.toThrow(/requires firmware 0\.2\.0/);
		await expect(call).rejects.toThrow(/Reflash it with: devicesdk flash/);
		expect(oldTransport.sent).toHaveLength(0);
	});

	test.each([
		"dht_read",
		"onewire_search",
		"onewire_read_temp",
	])("%s rejects with code firmware_incompatible on old firmware", async (commandType) => {
		const oldSender = new LocalDeviceSender(
			new FirmwareTransport("0.1.0", "esp32c3"),
		);
		const pin = 4;
		try {
			if (commandType === "dht_read") {
				await oldSender.dhtRead(pin, "dht22");
			} else if (commandType === "onewire_search") {
				await oldSender.onewireSearch(pin);
			} else {
				await oldSender.onewireReadTemperature(pin);
			}
			throw new Error("expected a firmware gate failure");
		} catch (error) {
			expect((error as Error & { code?: string }).code).toBe(
				"firmware_incompatible",
			);
		}
	});

	test.each([
		"dht_read",
		"onewire_search",
		"onewire_read_temp",
	])("%s passes on firmware 0.2.0", async (commandType) => {
		const currentTransport = new FirmwareTransport("0.2.0", "esp32c3");
		const currentSender = new LocalDeviceSender(currentTransport);
		const pin = 4;
		if (commandType === "dht_read") {
			await currentSender.dhtRead(pin, "dht22");
		} else if (commandType === "onewire_search") {
			await currentSender.onewireSearch(pin);
		} else {
			await currentSender.onewireReadTemperature(pin);
		}
		expect(currentTransport.sent).toHaveLength(1);
		expect(currentTransport.sent[0].type).toBe(commandType);
	});

	test("newer firmware than the minimum passes", async () => {
		const transport = new FirmwareTransport("0.3.0", "pico-w");
		const sender = new LocalDeviceSender(transport);
		await sender.dhtRead(4, "dht11");
		expect(transport.sent).toHaveLength(1);
	});
});
