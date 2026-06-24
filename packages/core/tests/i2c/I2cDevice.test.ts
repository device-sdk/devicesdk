import { describe, expect, it } from "vitest";
import { I2cDevice } from "../../src/i2c/I2cDevice.js";

class TestI2cDevice extends I2cDevice {
	publicQueueWrite(data: string[]): this {
		return this.queueWrite(data);
	}
	publicClearQueue(): this {
		return this.clearQueue();
	}
}

describe("I2cDevice", () => {
	it("defaults bus to 0 when omitted", () => {
		const d = new TestI2cDevice({ address: "0x3C" });
		const cmd = d.toBatchCommand();
		expect(cmd.payload.bus).toBe(0);
		expect(cmd.payload.address).toBe("0x3C");
	});

	it("respects an explicit bus", () => {
		const d = new TestI2cDevice({ bus: 1, address: "0x77" });
		expect(d.toBatchCommand().payload.bus).toBe(1);
	});

	it("queues writes in order and emits a snapshot copy", () => {
		const d = new TestI2cDevice({ address: "0x3C" });
		d.publicQueueWrite(["0x00", "0xAF"]);
		d.publicQueueWrite(["0x01"]);
		const cmd = d.toBatchCommand();
		expect(cmd.type).toBe("i2c_batch_write");
		expect(cmd.payload.writes).toEqual([["0x00", "0xAF"], ["0x01"]]);
	});

	it("toBatchCommand returns a copy - mutating it does not affect later calls", () => {
		const d = new TestI2cDevice({ address: "0x3C" });
		d.publicQueueWrite(["0xAA"]);
		const cmd = d.toBatchCommand();
		cmd.payload.writes.push(["0xBB"]);
		const cmd2 = d.toBatchCommand();
		expect(cmd2.payload.writes).toEqual([["0xAA"]]);
	});

	it("clearQueue empties pending writes", () => {
		const d = new TestI2cDevice({ address: "0x3C" });
		d.publicQueueWrite(["0xAA"]);
		d.publicClearQueue();
		expect(d.toBatchCommand().payload.writes).toEqual([]);
	});

	it("methods return `this` for chaining", () => {
		const d = new TestI2cDevice({ address: "0x3C" });
		expect(d.publicQueueWrite(["0x00"])).toBe(d);
		expect(d.publicClearQueue()).toBe(d);
	});
});
