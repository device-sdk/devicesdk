import { describe, expect, it } from "vitest";
import { SSD1306 } from "../../src/i2c/SSD1306.js";

describe("SSD1306", () => {
	describe("constructor defaults", () => {
		it("defaults to 128×64 ssd1306 at 0x3C with no offsets", () => {
			const d = new SSD1306({ address: "0x3C" });
			expect(d.width).toBe(128);
			expect(d.height).toBe(64);
			const cmd = d.toDisplayCommand();
			expect(cmd.payload.address).toBe("0x3C");
			expect(cmd.payload.controller).toBe("ssd1306");
			expect(cmd.payload.bus).toBe(0);
			expect(cmd.payload.width).toBe(128);
			expect(cmd.payload.height).toBe(64);
			// Offsets omitted from payload when zero
			expect(cmd.payload.columnOffset).toBeUndefined();
			expect(cmd.payload.pageOffset).toBeUndefined();
		});

		it("respects explicit dimensions and controller", () => {
			const d = new SSD1306({
				address: "0x3D",
				width: 64,
				height: 32,
				controller: "sh1106",
			});
			expect(d.width).toBe(64);
			expect(d.height).toBe(32);
			expect(d.toDisplayCommand().payload.controller).toBe("sh1106");
		});

		it("includes columnOffset/pageOffset when non-zero", () => {
			const d = new SSD1306({
				address: "0x3C",
				columnOffset: 28,
				pageOffset: 4,
			});
			const cmd = d.toDisplayCommand();
			expect(cmd.payload.columnOffset).toBe(28);
			expect(cmd.payload.pageOffset).toBe(4);
		});
	});

	describe("esp32c3OledVariant", () => {
		it("returns a 72×40 panel with columnOffset 28 at 0x3C", () => {
			const d = SSD1306.esp32c3OledVariant();
			expect(d.width).toBe(72);
			expect(d.height).toBe(40);
			const cmd = d.toDisplayCommand();
			expect(cmd.payload.address).toBe("0x3C");
			expect(cmd.payload.columnOffset).toBe(28);
		});

		it("accepts overrides for bus and address", () => {
			const d = SSD1306.esp32c3OledVariant({ bus: 1, address: "0x3D" });
			const cmd = d.toDisplayCommand();
			expect(cmd.payload.bus).toBe(1);
			expect(cmd.payload.address).toBe("0x3D");
		});
	});

	describe("setPixel / getPixel", () => {
		it("setPixel + getPixel round-trips at corners and interior", () => {
			const d = new SSD1306({ address: "0x3C" });
			d.setPixel(0, 0);
			d.setPixel(127, 63);
			d.setPixel(64, 32);
			expect(d.getPixel(0, 0)).toBe(true);
			expect(d.getPixel(127, 63)).toBe(true);
			expect(d.getPixel(64, 32)).toBe(true);
			expect(d.getPixel(1, 0)).toBe(false);
		});

		it("setPixel(false) clears a previously set pixel", () => {
			const d = new SSD1306({ address: "0x3C" });
			d.setPixel(10, 10, true);
			d.setPixel(10, 10, false);
			expect(d.getPixel(10, 10)).toBe(false);
		});

		it("out-of-bounds setPixel is a no-op (does not throw)", () => {
			const d = new SSD1306({ address: "0x3C", width: 128, height: 64 });
			expect(() => d.setPixel(-1, 0)).not.toThrow();
			expect(() => d.setPixel(128, 0)).not.toThrow();
			expect(() => d.setPixel(0, -1)).not.toThrow();
			expect(() => d.setPixel(0, 64)).not.toThrow();
			expect(d.getPixel(-1, 0)).toBe(false);
			expect(d.getPixel(128, 0)).toBe(false);
		});
	});

	describe("clear / fill / invert", () => {
		it("clear zeros the buffer", () => {
			const d = new SSD1306({ address: "0x3C" });
			d.fill();
			d.clear();
			const buf = d.getBuffer();
			expect(buf.every((b) => b === 0)).toBe(true);
		});

		it("fill sets every byte to 0xFF", () => {
			const d = new SSD1306({ address: "0x3C" });
			d.fill();
			const buf = d.getBuffer();
			expect(buf.every((b) => b === 0xff)).toBe(true);
		});

		it("invert flips every byte", () => {
			const d = new SSD1306({ address: "0x3C" });
			// Buffer starts all zero - invert → all 0xff
			d.invert();
			expect(d.getBuffer().every((b) => b === 0xff)).toBe(true);
			d.invert();
			expect(d.getBuffer().every((b) => b === 0x00)).toBe(true);
		});
	});

	describe("toDisplayCommand", () => {
		it("returns a display_update command with init flag echoed", () => {
			const d = new SSD1306({ address: "0x3C" });
			const cmd = d.toDisplayCommand({ init: true });
			expect(cmd.type).toBe("display_update");
			expect(cmd.payload.init).toBe(true);
		});

		it("with compress: false sends a single offset:0 segment containing the whole buffer", () => {
			const d = new SSD1306({ address: "0x3C" });
			const cmd = d.toDisplayCommand({ compress: false });
			expect(cmd.payload.segments).toHaveLength(1);
			expect(cmd.payload.segments[0].offset).toBe(0);
			expect(cmd.payload.segments[0].data.length).toBeGreaterThan(0);
		});

		it("sparse-encodes by default, emitting zero segments for an empty buffer", () => {
			const d = new SSD1306({ address: "0x3C" });
			const cmd = d.toDisplayCommand();
			expect(cmd.payload.segments).toEqual([]);
		});

		it("sparse-encodes a single non-zero run as one segment with the right offset", () => {
			const d = new SSD1306({ address: "0x3C" });
			// Pixel at (0, 0) sets buffer[0] bit 0 → byte 0 = 0x01
			d.setPixel(0, 0);
			const cmd = d.toDisplayCommand();
			expect(cmd.payload.segments).toHaveLength(1);
			expect(cmd.payload.segments[0].offset).toBe(0);
		});
	});

	describe("setBuffer", () => {
		it("throws when the supplied buffer length doesn't match the framebuffer", () => {
			const d = new SSD1306({ address: "0x3C" });
			expect(() => d.setBuffer(new Uint8Array(10))).toThrow(/Buffer size/);
		});

		it("accepts a buffer of the correct length", () => {
			const d = new SSD1306({ address: "0x3C", width: 128, height: 64 });
			const buf = new Uint8Array((128 * 64) / 8).fill(0xab);
			expect(() => d.setBuffer(buf)).not.toThrow();
			expect(d.getBuffer()[0]).toBe(0xab);
		});
	});

	describe("drawing primitives", () => {
		it("drawHLine sets every pixel along the horizontal", () => {
			const d = new SSD1306({ address: "0x3C" });
			d.drawHLine(5, 5, 10);
			for (let i = 0; i < 10; i++) {
				expect(d.getPixel(5 + i, 5)).toBe(true);
			}
			expect(d.getPixel(4, 5)).toBe(false);
			expect(d.getPixel(15, 5)).toBe(false);
		});

		it("drawRect outline draws four edges only", () => {
			const d = new SSD1306({ address: "0x3C" });
			d.drawRect(2, 2, 5, 5, false);
			// Corners on
			expect(d.getPixel(2, 2)).toBe(true);
			expect(d.getPixel(6, 6)).toBe(true);
			// Interior off (outline only)
			expect(d.getPixel(3, 3)).toBe(false);
		});

		it("drawRect fill=true fills the interior", () => {
			const d = new SSD1306({ address: "0x3C" });
			d.drawRect(2, 2, 5, 5, true);
			expect(d.getPixel(3, 3)).toBe(true);
			expect(d.getPixel(4, 4)).toBe(true);
		});
	});
});
