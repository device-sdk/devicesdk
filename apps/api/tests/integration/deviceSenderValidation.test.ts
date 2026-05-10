import { describe, expect, test } from "vitest";
import { DeviceSender } from "../../src/durableObjects/lib/deviceSender";

// `DeviceSender` extends WorkerEntrypoint, but its argument-validation paths
// throw before they ever touch ctx.env or the DO stub. We can construct an
// instance with placeholder ctx/env and exercise the synchronous throws
// without booting a real device or DO. If validation regresses, the test
// either no longer throws (false negative caught here) or throws the wrong
// message (also caught).

function makeSender(): DeviceSender {
	const ctx = {
		props: { projectId: "p", deviceId: "d" },
	} as unknown as ConstructorParameters<typeof DeviceSender>[0];
	const env = {
		DEVICE: {},
	} as unknown as ConstructorParameters<typeof DeviceSender>[1];
	return new DeviceSender(ctx, env);
}

describe("DeviceSender argument validation", () => {
	const sender = makeSender();

	test("setGpioState throws with code=invalid_argument when pin is out of range", async () => {
		await expect(sender.setGpioState(999, "high")).rejects.toThrow(
			/invalid pin/,
		);
		await expect(sender.setGpioState(999, "high")).rejects.toMatchObject({
			code: "invalid_argument",
		});
	});

	test("setGpioState throws when state is not high/low", async () => {
		await expect(
			// @ts-expect-error — exercising runtime validation
			sender.setGpioState(2, "ON"),
		).rejects.toThrow(/invalid state/);
	});

	test("setPwmState throws when dutyCycle is given as a percent (50)", async () => {
		await expect(sender.setPwmState(2, 1000, 50)).rejects.toThrow(
			/NOT a percent/,
		);
	});

	test("setPwmState throws when frequency is below 1 Hz", async () => {
		await expect(sender.setPwmState(2, 0, 0.5)).rejects.toThrow(
			/invalid frequency/,
		);
	});

	test("setPwmState throws when pin is non-integer", async () => {
		await expect(sender.setPwmState(2.5, 1000, 0.5)).rejects.toThrow(
			/invalid pin/,
		);
	});

	test("getPinState throws when mode is unknown", async () => {
		await expect(
			// @ts-expect-error — exercising runtime validation
			sender.getPinState(26, "pwm"),
		).rejects.toThrow(/invalid mode/);
	});

	test("i2cWrite throws when address is not a 7-bit hex string", async () => {
		await expect(sender.i2cWrite(0, "0xFFFF", ["0xAE"])).rejects.toThrow(
			/invalid I2C address/,
		);
	});

	test("i2cWrite throws when bytes are packed as one element", async () => {
		await expect(sender.i2cWrite(0, "0x3C", ["0xAEDA"])).rejects.toThrow(
			/data byte/,
		);
	});

	test("i2cRead throws when bytesToRead is zero", async () => {
		await expect(sender.i2cRead(0, "0x76", 0)).rejects.toThrow(
			/invalid bytesToRead/,
		);
	});

	test("i2cRead throws when registerToRead is malformed", async () => {
		await expect(sender.i2cRead(0, "0x76", 1, "0xZZ")).rejects.toThrow(
			/invalid registerToRead/,
		);
	});

	test("configureGpioInputMonitoring throws on bogus pull mode", async () => {
		await expect(
			// @ts-expect-error — exercising runtime validation
			sender.configureGpioInputMonitoring(2, true, "ground"),
		).rejects.toThrow(/invalid pull/);
	});

	test("spiConfigure throws on invalid SPI mode", async () => {
		await expect(
			// @ts-expect-error — exercising runtime validation
			sender.spiConfigure(0, 2, 3, 4, 5, 1_000_000, 7),
		).rejects.toThrow(/invalid mode/);
	});

	test("uartConfigure throws on out-of-range baud rate", async () => {
		await expect(sender.uartConfigure(0, 0, 1, 49)).rejects.toThrow(
			/invalid baudRate/,
		);
	});

	test("pioWs2812Configure throws on numLeds=0", async () => {
		await expect(sender.pioWs2812Configure(2, 0)).rejects.toThrow(
			/invalid numLeds/,
		);
	});

	test("pioWs2812Update throws on out-of-range channel", async () => {
		await expect(sender.pioWs2812Update([[256, 0, 0]])).rejects.toThrow(
			/channel/,
		);
	});

	test("pioWs2812Update throws on malformed pixel", async () => {
		await expect(
			// @ts-expect-error — exercising runtime validation
			sender.pioWs2812Update([[255, 0]]),
		).rejects.toThrow(/pixels\[0\]/);
	});

	test("error has docs URL pointing at the right page", async () => {
		try {
			await sender.setGpioState(999, "high");
		} catch (err) {
			expect((err as Error & { docs?: string }).docs).toBe(
				"https://devicesdk.com/docs/concepts/device-api/",
			);
		}
		try {
			await sender.i2cScan(99);
		} catch (err) {
			expect((err as Error & { docs?: string }).docs).toBe(
				"https://devicesdk.com/docs/guides/using-i2c/",
			);
		}
	});
});
