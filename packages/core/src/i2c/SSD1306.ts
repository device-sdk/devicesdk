import type {
	DisplayController,
	DisplaySegment,
	DisplayUpdateCommand,
} from "../index.js";
import { type Font, font5x7, getCharData } from "./fonts/font5x7.js";
import { I2cDevice, type I2cDeviceOptions } from "./I2cDevice.js";

export interface SSD1306Options extends I2cDeviceOptions {
	width?: number;
	height?: number;
	controller?: DisplayController;
	// For glasses whose visible window is offset from RAM column/page 0 - e.g. the
	// 0.42" 72x40 panels, which use columnOffset: 28 on most FN4 boards (and 30/32 on
	// other variants - verify with your board, see docs/hardware/esp32-c3.md).
	// Defaults to 0 (standard 128x64).
	columnOffset?: number;
	pageOffset?: number;
}

/**
 * SSD1306 OLED display driver
 *
 * Manages a local framebuffer and provides drawing methods.
 * Call toDisplayCommand() to generate a command that sends the
 * entire display contents in a single network call.
 *
 * @example
 * const display = new SSD1306({ address: "0x3C", width: 128, height: 64 });
 * display.clear().drawText(0, 0, "Hello!").drawLine(0, 10, 127, 10);
 * await device.sendCommand(display.toDisplayCommand({ init: true }));
 */
export class SSD1306 extends I2cDevice {
	private buffer: Uint8Array;
	private _width: number;
	private _height: number;
	private controller: DisplayController;
	private columnOffset: number;
	private pageOffset: number;

	constructor(options: SSD1306Options) {
		super({ bus: options.bus ?? 0, address: options.address ?? "0x3C" });
		this._width = options.width ?? 128;
		this._height = options.height ?? 64;
		this.controller = options.controller ?? "ssd1306";
		this.columnOffset = options.columnOffset ?? 0;
		this.pageOffset = options.pageOffset ?? 0;
		// Buffer size: width * (height / 8) for page-based addressing
		this.buffer = new Uint8Array((this._width * this._height) / 8);
	}

	/**
	 * Preset for the 72×40 OLED that ships built-in on common ESP32-C3
	 * "FN4 / 0.42-inch OLED" boards. The visible glass sits at column offset
	 * 28 in the controller's 128-wide RAM - without this offset, pixels render
	 * into the non-visible region.
	 *
	 * Pair with `i2c_configure({ bus: 0, sda_pin: 5, scl_pin: 6 })` for the
	 * default DevKit pinout (verify against your board's silkscreen - some
	 * variants swap SDA/SCL).
	 *
	 * @example
	 * const display = SSD1306.esp32c3OledVariant();
	 * display.clear().drawText(0, 0, "Hello!");
	 * await device.sendCommand(display.toDisplayCommand({ init: true }));
	 */
	static esp32c3OledVariant(opts: { bus?: number; address?: string } = {}) {
		return new SSD1306({
			bus: opts.bus ?? 0,
			address: opts.address ?? "0x3C",
			width: 72,
			height: 40,
			columnOffset: 28,
		});
	}

	get width(): number {
		return this._width;
	}

	get height(): number {
		return this._height;
	}

	/**
	 * Clear the display buffer (all pixels off)
	 */
	clear(): this {
		this.buffer.fill(0);
		return this;
	}

	/**
	 * Fill the display buffer (all pixels on)
	 */
	fill(): this {
		this.buffer.fill(0xff);
		return this;
	}

	/**
	 * Set a single pixel
	 * @param x X coordinate (0 = left)
	 * @param y Y coordinate (0 = top)
	 * @param on true = pixel on, false = pixel off
	 */
	setPixel(x: number, y: number, on: boolean = true): this {
		if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
			return this;
		}

		const page = Math.floor(y / 8);
		const bit = y % 8;
		const index = page * this._width + x;

		if (on) {
			this.buffer[index] |= 1 << bit;
		} else {
			this.buffer[index] &= ~(1 << bit);
		}

		return this;
	}

	/**
	 * Get a pixel value
	 */
	getPixel(x: number, y: number): boolean {
		if (x < 0 || x >= this._width || y < 0 || y >= this._height) {
			return false;
		}

		const page = Math.floor(y / 8);
		const bit = y % 8;
		const index = page * this._width + x;

		return (this.buffer[index] & (1 << bit)) !== 0;
	}

	/**
	 * Draw a line using Bresenham's algorithm
	 */
	drawLine(
		x0: number,
		y0: number,
		x1: number,
		y1: number,
		on: boolean = true,
	): this {
		const dx = Math.abs(x1 - x0);
		const dy = Math.abs(y1 - y0);
		const sx = x0 < x1 ? 1 : -1;
		const sy = y0 < y1 ? 1 : -1;
		let err = dx - dy;

		let x = x0;
		let y = y0;

		while (true) {
			this.setPixel(x, y, on);

			if (x === x1 && y === y1) break;

			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				x += sx;
			}
			if (e2 < dx) {
				err += dx;
				y += sy;
			}
		}

		return this;
	}

	/**
	 * Draw a horizontal line (optimized)
	 */
	drawHLine(x: number, y: number, length: number, on: boolean = true): this {
		for (let i = 0; i < length; i++) {
			this.setPixel(x + i, y, on);
		}
		return this;
	}

	/**
	 * Draw a vertical line (optimized)
	 */
	drawVLine(x: number, y: number, length: number, on: boolean = true): this {
		for (let i = 0; i < length; i++) {
			this.setPixel(x, y + i, on);
		}
		return this;
	}

	/**
	 * Draw a rectangle
	 * @param fill If true, fill the rectangle; otherwise draw outline only
	 */
	drawRect(
		x: number,
		y: number,
		w: number,
		h: number,
		fill: boolean = false,
		on: boolean = true,
	): this {
		if (fill) {
			for (let row = 0; row < h; row++) {
				this.drawHLine(x, y + row, w, on);
			}
		} else {
			this.drawHLine(x, y, w, on);
			this.drawHLine(x, y + h - 1, w, on);
			this.drawVLine(x, y, h, on);
			this.drawVLine(x + w - 1, y, h, on);
		}
		return this;
	}

	/**
	 * Draw a circle using midpoint algorithm
	 */
	drawCircle(
		cx: number,
		cy: number,
		r: number,
		fill: boolean = false,
		on: boolean = true,
	): this {
		let x = r;
		let y = 0;
		let err = 0;

		while (x >= y) {
			if (fill) {
				this.drawHLine(cx - x, cy + y, 2 * x + 1, on);
				this.drawHLine(cx - x, cy - y, 2 * x + 1, on);
				this.drawHLine(cx - y, cy + x, 2 * y + 1, on);
				this.drawHLine(cx - y, cy - x, 2 * y + 1, on);
			} else {
				this.setPixel(cx + x, cy + y, on);
				this.setPixel(cx - x, cy + y, on);
				this.setPixel(cx + x, cy - y, on);
				this.setPixel(cx - x, cy - y, on);
				this.setPixel(cx + y, cy + x, on);
				this.setPixel(cx - y, cy + x, on);
				this.setPixel(cx + y, cy - x, on);
				this.setPixel(cx - y, cy - x, on);
			}

			y++;
			err += 1 + 2 * y;
			if (2 * (err - x) + 1 > 0) {
				x--;
				err += 1 - 2 * x;
			}
		}

		return this;
	}

	/**
	 * Draw a single character
	 * @returns The x position after the character (for chaining text)
	 */
	drawChar(
		x: number,
		y: number,
		char: string,
		font: Font = font5x7,
		on: boolean = true,
	): number {
		const charData = getCharData(char, font);
		if (!charData) {
			return x + font.width + 1;
		}

		for (let col = 0; col < font.width; col++) {
			const colData = charData[col];
			for (let row = 0; row < font.height; row++) {
				if (colData & (1 << row)) {
					this.setPixel(x + col, y + row, on);
				}
			}
		}

		return x + font.width + 1; // +1 for spacing
	}

	/**
	 * Draw text string
	 * @param x Starting X position
	 * @param y Starting Y position
	 * @param text The text to draw
	 * @param font Font to use (default: font5x7)
	 */
	drawText(
		x: number,
		y: number,
		text: string,
		font: Font = font5x7,
		on: boolean = true,
	): this {
		let cursorX = x;
		for (const char of text) {
			if (char === "\n") {
				cursorX = x;
				y += font.height + 1;
				continue;
			}
			cursorX = this.drawChar(cursorX, y, char, font, on);
		}
		return this;
	}

	/**
	 * Draw a bitmap
	 * @param bitmap Raw bitmap data (1 bit per pixel, row-major, MSB first)
	 * @param bitmapWidth Width of the bitmap
	 * @param bitmapHeight Height of the bitmap
	 */
	drawBitmap(
		x: number,
		y: number,
		bitmap: Uint8Array,
		bitmapWidth: number,
		bitmapHeight: number,
		on: boolean = true,
	): this {
		let bitIndex = 0;
		for (let row = 0; row < bitmapHeight; row++) {
			for (let col = 0; col < bitmapWidth; col++) {
				const byteIndex = Math.floor(bitIndex / 8);
				const bitOffset = 7 - (bitIndex % 8);
				const pixelOn = (bitmap[byteIndex] & (1 << bitOffset)) !== 0;
				if (pixelOn) {
					this.setPixel(x + col, y + row, on);
				}
				bitIndex++;
			}
		}
		return this;
	}

	/**
	 * Invert all pixels in the buffer
	 */
	invert(): this {
		for (let i = 0; i < this.buffer.length; i++) {
			this.buffer[i] = ~this.buffer[i] & 0xff;
		}
		return this;
	}

	/**
	 * Get the raw framebuffer
	 */
	getBuffer(): Uint8Array {
		return this.buffer;
	}

	/**
	 * Set the raw framebuffer
	 */
	setBuffer(buffer: Uint8Array): this {
		if (buffer.length !== this.buffer.length) {
			throw new Error(
				`Buffer size mismatch: expected ${this.buffer.length}, got ${buffer.length}`,
			);
		}
		this.buffer.set(buffer);
		return this;
	}

	/**
	 * Generate a display update command with sparse encoding
	 * Only sends non-zero segments to reduce payload size
	 * @param options.init If true, firmware should run init sequence before displaying
	 * @param options.compress If true (default), use sparse encoding; if false, send full buffer
	 */
	toDisplayCommand(options?: {
		init?: boolean;
		compress?: boolean;
	}): Omit<DisplayUpdateCommand, "id"> {
		const compress = options?.compress ?? true;
		const segments = compress
			? this.sparseEncodeBuffer(this.buffer)
			: [{ offset: 0, data: this.encodeBase64(this.buffer) }];

		return {
			type: "display_update",
			payload: {
				bus: this.bus,
				address: this.address,
				controller: this.controller,
				width: this._width,
				height: this._height,
				...(this.columnOffset !== 0 && { columnOffset: this.columnOffset }),
				...(this.pageOffset !== 0 && { pageOffset: this.pageOffset }),
				init: options?.init,
				segments,
			},
		};
	}

	/**
	 * Sparse encode a buffer, extracting only non-zero segments
	 * Groups consecutive non-zero bytes into segments with offset and base64 data
	 */
	private sparseEncodeBuffer(buffer: Uint8Array): DisplaySegment[] {
		const segments: DisplaySegment[] = [];
		let segmentStart = -1;

		for (let i = 0; i <= buffer.length; i++) {
			const isNonZero = i < buffer.length && buffer[i] !== 0;

			if (isNonZero && segmentStart === -1) {
				// Start of a new segment
				segmentStart = i;
			} else if (!isNonZero && segmentStart !== -1) {
				// End of current segment
				const segmentData = buffer.slice(segmentStart, i);
				segments.push({
					offset: segmentStart,
					data: this.encodeBase64(segmentData),
				});
				segmentStart = -1;
			}
		}

		return segments;
	}

	/**
	 * Encode Uint8Array to base64 string
	 * Uses a pure JavaScript implementation for portability
	 */
	private encodeBase64(data: Uint8Array): string {
		const chars =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		let result = "";
		const len = data.length;

		for (let i = 0; i < len; i += 3) {
			const a = data[i];
			const b = i + 1 < len ? data[i + 1] : 0;
			const c = i + 2 < len ? data[i + 2] : 0;

			const triplet = (a << 16) | (b << 8) | c;

			result += chars[(triplet >> 18) & 0x3f];
			result += chars[(triplet >> 12) & 0x3f];
			result += i + 1 < len ? chars[(triplet >> 6) & 0x3f] : "=";
			result += i + 2 < len ? chars[triplet & 0x3f] : "=";
		}

		return result;
	}
}
