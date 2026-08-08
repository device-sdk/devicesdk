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
	 * Max bytes read for a single `get` reply. Default: 64.
	 */
	getBufferSize?: number;
	/**
	 * Timeout in ms for `get` replies. Default: 500.
	 */
	getTimeoutMs?: number;
}

/** Hex-string encoding of a byte, e.g. `0x41`. */
function toHexByte(byte: number): string {
	return `0x${byte.toString(16).padStart(2, "0").toUpperCase()}`;
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
 */
export class NextionDisplay {
	private readonly device: DeviceSenderInterface;
	private readonly port: number;
	private readonly txPin: number;
	private readonly rxPin: number;
	private readonly baudRate: number;
	private readonly getBufferSize: number;
	private readonly getTimeoutMs: number;

	constructor(device: DeviceSenderInterface, options: NextionDisplayOptions) {
		this.device = device;
		this.port = options.port;
		this.txPin = options.txPin;
		this.rxPin = options.rxPin;
		this.baudRate = options.baudRate ?? 9600;
		this.getBufferSize = options.getBufferSize ?? 64;
		this.getTimeoutMs = options.getTimeoutMs ?? 500;
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
	}

	/** Switch to a page by its zero-based index in the Nextion Editor. */
	async setPage(page: number): Promise<void> {
		await this.sendRaw(`page ${page}`);
	}

	/** Set a text component's `.txt` value, e.g. `tTitle.txt="Heater"`. */
	async setText(component: string, value: string): Promise<void> {
		const escaped = value.replaceAll('"', '\\"');
		await this.sendRaw(`${component}.txt="${escaped}"`);
	}

	/** Set a numeric component's `.val`, e.g. `nTemp.val=215`. */
	async setNumber(component: string, value: number): Promise<void> {
		await this.sendRaw(`${component}.val=${value}`);
	}

	/** Show or hide a component (`vis`). */
	async setVisible(component: string, visible: boolean): Promise<void> {
		await this.sendRaw(`vis ${component},${visible ? 1 : 0}`);
	}

	/** Set a component's font color (`pco`). */
	async setTextColor(component: string, color: number): Promise<void> {
		await this.sendRaw(`pco ${component},${color}`);
	}

	/** Set a component's background color (`bco`). */
	async setBackgroundColor(component: string, color: number): Promise<void> {
		await this.sendRaw(`bco ${component},${color}`);
	}

	/** Force a component to redraw (`ref`). */
	async refresh(component: string): Promise<void> {
		await this.sendRaw(`ref ${component}`);
	}

	/**
	 * Read a component attribute with the `get` instruction, e.g.
	 * `get nTemp.val`. Resolves with the panel's reply (the trailing
	 * `0xFF 0xFF 0xFF` terminator is stripped). Returns the raw string value -
	 * numeric components generally come back as decimal, but some panel
	 * firmwares reply in hex, so parse accordingly.
	 */
	async get(component: string): Promise<string> {
		await this.sendRaw(`get ${component}`);
		const response = await this.device.uartRead(
			this.port,
			this.getBufferSize,
			this.getTimeoutMs,
		);
		if (response.type === "command_error") {
			throw new Error(`Nextion get failed: ${response.payload.error}`);
		}
		if (response.type !== "uart_read_result") {
			throw new Error(`Nextion get: unexpected response type ${response.type}`);
		}
		const data = response.payload.data;
		let end = data.length;
		while (end > 0 && data[end - 1].toLowerCase() === "0xff") end--;
		return NextionDisplay.bytesToAscii(data.slice(0, end));
	}

	/**
	 * Send a raw instruction, appending the mandatory `0xFF 0xFF 0xFF`
	 * terminator. Useful for instructions the typed helpers don't cover yet.
	 */
	async sendRaw(instruction: string): Promise<void> {
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
}
