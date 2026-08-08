import type { DeviceSenderInterface } from "../index.js";

/**
 * Configuration for a {@link NextionDisplay}.
 *
 * A Nextion is a serial HMI panel from ITEAD that speaks its own ASCII
 * instruction set over a single UART link. Design the screens in the Nextion
 * Editor, flash the `.tft` file to the panel (over serial or microSD), then
 * drive the components from your device script.
 */
export interface NextionDisplayOptions {
	/**
	 * UART port the panel is wired to. ESP32: ports 1-2 (port 0 is reserved
	 * for the debug console). Pico: ports 0-1. Simulator: port 0.
	 */
	port: number;
	/** UART TX pin (to the panel's RX). */
	txPin: number;
	/** UART RX pin (to the panel's TX). */
	rxPin: number;
	/**
	 * Baud rate. Must match the panel's configured speed (default 9600,
	 * commonly raised to 115200 in the Nextion Editor). Default: 9600.
	 */
	baudRate?: number;
	/**
	 * Max bytes accumulated while waiting for a `get` reply. Replies longer
	 * than this throw instead of silently truncating. Default: 64.
	 */
	getBufferSize?: number;
	/**
	 * Total time budget in ms for a `get` reply. The driver reads in short
	 * chunks until it sees the `0xFF 0xFF 0xFF` frame terminator, so a normal
	 * reply costs far less than this budget. Default: 500.
	 */
	getTimeoutMs?: number;
}

/** Hex-string encoding of a byte, e.g. `0x41`. */
function toHexByte(byte: number): string {
	return `0x${byte.toString(16).padStart(2, "0").toUpperCase()}`;
}

/** Length of one `get` read chunk in ms - short so replies return quickly. */
const GET_CHUNK_MS = 50;

/**
 * Encode a text value for a `.txt` attribute. The Nextion instruction set
 * defines two escapes - `\\` (literal backslash) and `\r` (carriage return,
 * the panel's newline). `"` has **no** escape: it terminates the string, so
 * quotes and other control characters are stripped rather than corrupting
 * the frame.
 */
function encodeTextValue(value: string): string {
	let out = "";
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (char === "\\") out += "\\\\";
		else if (char === "\r") out += "\\r";
		else if (code < 0x20 || code === 0x7f || char === '"') continue;
		else out += char;
	}
	return out;
}

/**
 * Index of the first `0xFF 0xFF 0xFF` frame terminator, or -1. Values may be
 * followed by further traffic (e.g. a `bkcmd` ack), so the first terminator
 * bounds the value, not the last.
 */
function indexOfFrameEnd(bytes: string[]): number {
	const last = bytes.length - 3;
	for (let i = 0; i <= last; i++) {
		if (
			bytes[i].toLowerCase() === "0xff" &&
			bytes[i + 1].toLowerCase() === "0xff" &&
			bytes[i + 2].toLowerCase() === "0xff"
		) {
			return i;
		}
	}
	return -1;
}

/**
 * Nextion serial HMI display driver
 *
 * Wraps the `DEVICE.uart*` methods so device scripts can talk to a Nextion
 * panel with typed calls instead of hand-built hex byte arrays. Every
 * instruction is ASCII text terminated by the protocol's mandatory three
 * `0xFF 0xFF 0xFF` bytes; this class handles that encoding for you.
 *
 * The panel's screen design (components, pages, images) is created in the
 * Nextion Editor - this driver only updates and reads what the design
 * exposes. Touch events are **not yet supported**; see the design doc
 * `docs/designs/nextion-dev-experience.md` for the planned reactive touch
 * path.
 *
 * @example
 * const display = new NextionDisplay(this.env.DEVICE, {
 *   port: 2, txPin: 17, rxPin: 16, baudRate: 115200,
 * });
 * await display.connect();
 * await display.setPage(0);
 * await display.setText("tTemp", "21.5");
 * const temp = await display.getNumber("nTemp");
 */
export class NextionDisplay {
	private readonly device: DeviceSenderInterface;
	private readonly port: number;
	private readonly txPin: number;
	private readonly rxPin: number;
	private readonly baudRate: number;
	private readonly getBufferSize: number;
	private readonly getTimeoutMs: number;
	private connected = false;

	constructor(device: DeviceSenderInterface, options: NextionDisplayOptions) {
		if (!Number.isInteger(options.port) || options.port < 0) {
			throw new RangeError(
				"NextionDisplay: port must be a non-negative integer",
			);
		}
		for (const [name, pin] of [
			["txPin", options.txPin],
			["rxPin", options.rxPin],
		] as const) {
			if (!Number.isInteger(pin) || pin < 0 || pin > 99) {
				throw new RangeError(
					`NextionDisplay: ${name} must be an integer in 0..99`,
				);
			}
		}
		const baudRate = options.baudRate ?? 9600;
		if (!Number.isInteger(baudRate) || baudRate < 50 || baudRate > 5_000_000) {
			throw new RangeError(
				"NextionDisplay: baudRate must be an integer in 50..5000000",
			);
		}
		const getBufferSize = options.getBufferSize ?? 64;
		if (
			!Number.isInteger(getBufferSize) ||
			getBufferSize < 1 ||
			getBufferSize > 4096
		) {
			throw new RangeError(
				"NextionDisplay: getBufferSize must be an integer in 1..4096",
			);
		}
		const getTimeoutMs = options.getTimeoutMs ?? 500;
		if (
			!Number.isInteger(getTimeoutMs) ||
			getTimeoutMs < 1 ||
			getTimeoutMs > 60_000
		) {
			throw new RangeError(
				"NextionDisplay: getTimeoutMs must be an integer in 1..60000",
			);
		}
		this.device = device;
		this.port = options.port;
		this.txPin = options.txPin;
		this.rxPin = options.rxPin;
		this.baudRate = baudRate;
		this.getBufferSize = getBufferSize;
		this.getTimeoutMs = getTimeoutMs;
	}

	/**
	 * Configure the UART port for this display. Call once before any other
	 * method.
	 */
	async connect(): Promise<void> {
		await this.device.uartConfigure(
			this.port,
			this.txPin,
			this.rxPin,
			this.baudRate,
		);
		this.connected = true;
	}

	/** Switch to a page by its zero-based index in the Nextion Editor. */
	async setPage(page: number): Promise<void> {
		if (!Number.isInteger(page) || page < 0) {
			throw new RangeError("setPage: page must be a non-negative integer");
		}
		await this.sendRaw(`page ${page}`);
	}

	/**
	 * Set a text component's `.txt` value, e.g. `tTitle.txt="Heater"`.
	 * Backslashes are escaped as `\\` and carriage returns as `\r` (the
	 * panel's newline); quotes and control characters cannot be represented
	 * and are stripped.
	 */
	async setText(component: string, value: string): Promise<void> {
		await this.sendRaw(`${component}.txt="${encodeTextValue(value)}"`);
	}

	/** Set a numeric component's `.val`, e.g. `nTemp.val=215`. */
	async setNumber(component: string, value: number): Promise<void> {
		if (!Number.isFinite(value)) {
			throw new RangeError("setNumber: value must be a finite number");
		}
		await this.sendRaw(`${component}.val=${value}`);
	}

	/** Show or hide a component (`vis`). */
	async setVisible(component: string, visible: boolean): Promise<void> {
		await this.sendRaw(`vis ${component},${visible ? 1 : 0}`);
	}

	/**
	 * Set a component's font color (`pco`). Colors are 16-bit 565 RGB, e.g.
	 * `63488` is red, `1024` is green, `31` is blue.
	 */
	async setTextColor(component: string, color: number): Promise<void> {
		this.assertColor(color);
		await this.sendRaw(`pco ${component},${color}`);
	}

	/** Set a component's background color (`bco`). See {@link setTextColor}. */
	async setBackgroundColor(component: string, color: number): Promise<void> {
		this.assertColor(color);
		await this.sendRaw(`bco ${component},${color}`);
	}

	/** Force a component to redraw (`ref`). */
	async refresh(component: string): Promise<void> {
		await this.sendRaw(`ref ${component}`);
	}

	/**
	 * Read a component attribute with the `get` instruction, e.g.
	 * `get nTemp.val`. Resolves with the panel's reply - everything before
	 * the first `0xFF 0xFF 0xFF` terminator, decoded to text. Numeric
	 * components generally come back as decimal, but some panel firmwares
	 * reply in hex, so parse accordingly (or use {@link getNumber}).
	 *
	 * Throws if the panel sends no reply (wrong component name, bad wiring),
	 * or if the reply exceeds `getBufferSize` without a terminator - it never
	 * silently returns an empty or truncated value.
	 */
	async get(component: string, attribute = "val"): Promise<string> {
		this.assertConnected();
		await this.sendRaw(`get ${component}.${attribute}`);

		const chunkMs = Math.min(GET_CHUNK_MS, this.getTimeoutMs);
		const bytes: string[] = [];
		let waited = 0;
		let replyComplete = false;
		while (waited < this.getTimeoutMs && bytes.length < this.getBufferSize) {
			const response = await this.device.uartRead(
				this.port,
				this.getBufferSize - bytes.length,
				chunkMs,
			);
			if (response.type === "command_error") {
				throw new Error(`Nextion get failed: ${response.payload.error}`);
			}
			if (response.type !== "uart_read_result") {
				throw new Error(
					`Nextion get: unexpected response type ${response.type}`,
				);
			}
			const data = response.payload.data;
			bytes.push(...data);
			waited += chunkMs;

			const valueEnd = indexOfFrameEnd(bytes);
			if (valueEnd !== -1) {
				const value = NextionDisplay.bytesToAscii(bytes.slice(0, valueEnd));
				// With the default `bkcmd` error-reporting mode the panel
				// answers a failed `get` (e.g. unknown component) with a bare
				// `0x00` error byte instead of a value.
				if (value === "\u0000") {
					throw new Error(
						`Nextion get: the panel reported an error for "${component}.${attribute}" (check the component name)`,
					);
				}
				return value;
			}
			// Quiet bus after some bytes: the panel's reply burst is complete,
			// but it was not frame-terminated.
			if (bytes.length > 0 && data.length === 0) {
				replyComplete = true;
				break;
			}
		}

		if (bytes.length === 0) {
			throw new Error(
				`Nextion get: no reply for "${component}.${attribute}" - check the component name, wiring, and baud rate`,
			);
		}
		if (replyComplete) {
			throw new Error(
				`Nextion get: the reply for "${component}.${attribute}" ended without a terminator (reply length ${bytes.length})`,
			);
		}
		if (bytes.length >= this.getBufferSize) {
			throw new Error(
				`Nextion get: reply for "${component}.${attribute}" exceeded ${this.getBufferSize} bytes without a terminator (raise getBufferSize)`,
			);
		}
		throw new Error(
			`Nextion get: reply for "${component}.${attribute}" did not terminate within the ${this.getTimeoutMs} ms timeout budget (got ${bytes.length} bytes)`,
		);
	}

	/**
	 * Read a numeric component's `.val` and parse it. Accepts decimal replies
	 * (`"25"`) and the hex replies some panel firmwares send (`"0x19"`).
	 */
	async getNumber(component: string): Promise<number> {
		const raw = (await this.get(component, "val")).trim();
		if (/^0x[0-9a-f]+$/i.test(raw)) {
			return Number.parseInt(raw, 16);
		}
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) {
			throw new Error(`Nextion getNumber: cannot parse "${raw}" as a number`);
		}
		return parsed;
	}

	/**
	 * Send a raw instruction, appending the mandatory `0xFF 0xFF 0xFF`
	 * terminator. Useful for instructions the typed helpers don't cover yet.
	 */
	async sendRaw(instruction: string): Promise<void> {
		this.assertConnected();
		await this.device.uartWrite(
			this.port,
			NextionDisplay.toBytes(instruction).concat(NextionDisplay.frameEnd()),
		);
	}

	/** UTF-8 encode `text` into the `"0x.."` hex-string byte format. */
	static toBytes(text: string): string[] {
		const encoded = new TextEncoder().encode(text);
		return Array.from(encoded, (byte) => toHexByte(byte));
	}

	/** Decode `"0x.."` hex-string bytes back into text (UTF-8). */
	static bytesToAscii(bytes: string[]): string {
		const decoded = new Uint8Array(bytes.length);
		for (let i = 0; i < bytes.length; i++) {
			const raw = bytes[i];
			if (!/^0x[0-9A-Fa-f]{1,2}$/.test(raw)) {
				throw new Error(`Invalid hex byte: ${raw}`);
			}
			decoded[i] = Number.parseInt(raw, 16);
		}
		return new TextDecoder().decode(decoded);
	}

	/** The three `0xFF` bytes that end every Nextion frame. */
	static frameEnd(): string[] {
		return ["0xFF", "0xFF", "0xFF"];
	}

	private assertConnected(): void {
		if (!this.connected) {
			throw new Error("NextionDisplay: call connect() before sending commands");
		}
	}

	private assertColor(color: number): void {
		if (!Number.isInteger(color) || color < 0 || color > 0xffff) {
			throw new RangeError("color must be a 16-bit 565 RGB value in 0..65535");
		}
	}
}
