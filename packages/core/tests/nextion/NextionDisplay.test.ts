import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceResponse, DeviceSenderInterface } from "../../src/index.js";
import { NextionDisplay } from "../../src/nextion/NextionDisplay.js";

/** Captures every call made through the DEVICE bridge. */
function makeDevice() {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const recorder = {
		uartConfigure: vi.fn(async (...args: unknown[]) => {
			calls.push({ method: "uartConfigure", args });
		}),
		uartWrite: vi.fn(async (...args: unknown[]) => {
			calls.push({ method: "uartWrite", args });
		}),
		uartRead: vi.fn(async (...args: unknown[]): Promise<DeviceResponse> => {
			calls.push({ method: "uartRead", args });
			return {
				id: "reply",
				type: "uart_read_result",
				payload: { port: 2, data: [], bytes_read: 0 },
			};
		}),
	};
	return { device: recorder as unknown as DeviceSenderInterface, calls };
}

/** Queue uart_read replies; a final empty reply stands in for a quiet bus. */
function queueReplies(
	device: DeviceSenderInterface,
	...replies: Array<{ data: string[]; bytes_read?: number }>
) {
	const uartRead = device.uartRead as ReturnType<typeof vi.fn>;
	for (const reply of replies) {
		uartRead.mockResolvedValueOnce({
			id: "reply",
			type: "uart_read_result",
			payload: {
				port: 2,
				data: reply.data,
				bytes_read: reply.bytes_read ?? reply.data.length,
			},
		});
	}
}

const BASE = { port: 2, txPin: 17, rxPin: 16 };

describe("NextionDisplay", () => {
	describe("byte encoding", () => {
		it("encodes ASCII text as hex-string bytes", () => {
			expect(NextionDisplay.toBytes("AB")).toEqual(["0x41", "0x42"]);
			expect(NextionDisplay.toBytes("")).toEqual([]);
		});

		it("encodes non-ASCII as UTF-8", () => {
			expect(NextionDisplay.toBytes("°C")).toEqual(["0xC2", "0xB0", "0x43"]);
		});

		it("decodes hex-string bytes back to text", () => {
			expect(NextionDisplay.bytesToAscii(["0x68", "0x69"])).toBe("hi");
			expect(NextionDisplay.bytesToAscii(["0xC2", "0xB0", "0x43"])).toBe("°C");
		});

		it("rejects malformed hex strings", () => {
			expect(() => NextionDisplay.bytesToAscii(["0xGG"])).toThrow(
				"Invalid hex byte",
			);
		});

		it("frameEnd is the three-byte terminator", () => {
			expect(NextionDisplay.frameEnd()).toEqual(["0xFF", "0xFF", "0xFF"]);
		});
	});

	describe("constructor validation", () => {
		it("rejects invalid ports, pins, baud rate and get options", () => {
			expect(
				() => new NextionDisplay({} as never, { ...BASE, port: -1 }),
			).toThrow("port");
			expect(
				() => new NextionDisplay({} as never, { ...BASE, txPin: 100 }),
			).toThrow("txPin");
			expect(
				() => new NextionDisplay({} as never, { ...BASE, rxPin: 1.5 }),
			).toThrow("rxPin");
			expect(
				() => new NextionDisplay({} as never, { ...BASE, baudRate: 0 }),
			).toThrow("baudRate");
			expect(
				() => new NextionDisplay({} as never, { ...BASE, getBufferSize: 0 }),
			).toThrow("getBufferSize");
			expect(
				() => new NextionDisplay({} as never, { ...BASE, getTimeoutMs: -1 }),
			).toThrow("getTimeoutMs");
		});
	});

	describe("instruction encoding", () => {
		const { device, calls } = makeDevice();
		const display = new NextionDisplay(device, {
			...BASE,
			baudRate: 115200,
		});
		beforeEach(async () => {
			calls.length = 0;
			await display.connect();
		});

		it("connect configures the UART port", () => {
			expect(calls[0]).toEqual({
				method: "uartConfigure",
				args: [2, 17, 16, 115200],
			});
		});

		it("appends the frame terminator to every instruction", async () => {
			await display.setPage(0);
			const data = calls.at(-1)!.args[1] as string[];
			expect(NextionDisplay.bytesToAscii(data.slice(0, -3))).toBe("page 0");
			expect(data.slice(-3)).toEqual(["0xFF", "0xFF", "0xFF"]);
		});

		it("setText strips quotes, escapes backslashes and \\r, drops control chars", async () => {
			await display.setText("tTitle", 'say "hi"');
			expect(
				NextionDisplay.bytesToAscii(
					(calls.at(-1)!.args[1] as string[]).slice(0, -3),
				),
			).toBe('tTitle.txt="say hi"');

			await display.setText("tPath", "C:\\temp");
			expect(
				NextionDisplay.bytesToAscii(
					(calls.at(-1)!.args[1] as string[]).slice(0, -3),
				),
			).toBe('tPath.txt="C:\\\\temp"');

			await display.setText("tMulti", "a\rb\nc");
			expect(
				NextionDisplay.bytesToAscii(
					(calls.at(-1)!.args[1] as string[]).slice(0, -3),
				),
			).toBe('tMulti.txt="a\\rbc"');
		});

		it("encodes numbers, visibility, colors and refresh", async () => {
			await display.setNumber("nTemp", 21.5);
			expect(
				NextionDisplay.bytesToAscii(
					(calls.at(-1)!.args[1] as string[]).slice(0, -3),
				),
			).toBe("nTemp.val=21.5");

			await display.setVisible("btn1", false);
			expect(
				NextionDisplay.bytesToAscii(
					(calls.at(-1)!.args[1] as string[]).slice(0, -3),
				),
			).toBe("vis btn1,0");

			await display.setTextColor("tTemp", 63488);
			expect(
				NextionDisplay.bytesToAscii(
					(calls.at(-1)!.args[1] as string[]).slice(0, -3),
				),
			).toBe("pco tTemp,63488");

			await display.setBackgroundColor("tTemp", 1024);
			expect(
				NextionDisplay.bytesToAscii(
					(calls.at(-1)!.args[1] as string[]).slice(0, -3),
				),
			).toBe("bco tTemp,1024");

			await display.refresh("tTemp");
			expect(
				NextionDisplay.bytesToAscii(
					(calls.at(-1)!.args[1] as string[]).slice(0, -3),
				),
			).toBe("ref tTemp");
		});

		it("sendRaw writes the raw instruction", async () => {
			await display.sendRaw("dim=50");
			const data = calls.at(-1)!.args[1] as string[];
			expect(NextionDisplay.bytesToAscii(data.slice(0, -3))).toBe("dim=50");
			expect(data.slice(-3)).toEqual(["0xFF", "0xFF", "0xFF"]);
		});

		it("rejects non-finite numbers and invalid colors", async () => {
			await expect(display.setNumber("nTemp", Number.NaN)).rejects.toThrow(
				"finite",
			);
			await expect(
				display.setNumber("nTemp", Number.POSITIVE_INFINITY),
			).rejects.toThrow("finite");
			await expect(display.setTextColor("tTemp", 70000)).rejects.toThrow(
				"color",
			);
		});
	});

	describe("connect guard", () => {
		it("blocks commands before connect()", async () => {
			const { device } = makeDevice();
			const display = new NextionDisplay(device, BASE);
			await expect(display.setPage(0)).rejects.toThrow("connect()");
			await expect(display.get("nTemp")).rejects.toThrow("connect()");
			await expect(display.sendRaw("dim=50")).rejects.toThrow("connect()");
		});
	});

	describe("get", () => {
		it("decodes a terminated reply and strips the terminator", async () => {
			const { device, calls } = makeDevice();
			queueReplies(device, {
				data: ["0x32", "0x35", "0xFF", "0xFF", "0xFF"],
			});
			const display = new NextionDisplay(device, BASE);
			await display.connect();

			await expect(display.get("nTemp")).resolves.toBe("25");
			expect(
				NextionDisplay.bytesToAscii(
					(
						calls.find((c) => c.method === "uartWrite")!.args[1] as string[]
					).slice(0, -3),
				),
			).toBe("get nTemp.val");
		});

		it("sends the requested attribute path", async () => {
			const { device, calls } = makeDevice();
			queueReplies(device, {
				data: ["0x41", "0xFF", "0xFF", "0xFF"],
			});
			const display = new NextionDisplay(device, BASE);
			await display.connect();

			await expect(display.get("tTitle", "txt")).resolves.toBe("A");
			const write = calls.find((c) => c.method === "uartWrite")!;
			expect(
				NextionDisplay.bytesToAscii((write.args[1] as string[]).slice(0, -3)),
			).toBe("get tTitle.txt");
		});

		it("ignores trailing traffic after the first terminator (bkcmd ack)", async () => {
			const { device } = makeDevice();
			queueReplies(device, {
				data: [
					"0x32",
					"0x35",
					"0xFF",
					"0xFF",
					"0xFF", // value 25
					"0x01",
					"0xFF",
					"0xFF",
					"0xFF", // ack
				],
			});
			const display = new NextionDisplay(device, BASE);
			await display.connect();

			await expect(display.get("nTemp")).resolves.toBe("25");
		});

		it("reads multi-chunk replies until the terminator", async () => {
			const { device } = makeDevice();
			// 64-byte getBufferSize; first read returns half, second the rest.
			queueReplies(
				device,
				{ data: ["0x31", "0x32", "0x33"] },
				{ data: ["0x34", "0xFF", "0xFF", "0xFF"] },
			);
			const display = new NextionDisplay(device, BASE);
			await display.connect();

			await expect(display.get("nTemp")).resolves.toBe("1234");
		});

		it("throws when the panel reports an error byte (0x00)", async () => {
			const { device } = makeDevice();
			queueReplies(device, { data: ["0x00", "0xFF", "0xFF", "0xFF"] });
			const display = new NextionDisplay(device, BASE);
			await display.connect();

			await expect(display.get("nope")).rejects.toThrow(
				"panel reported an error",
			);
		});

		it("throws on no reply", async () => {
			const { device } = makeDevice();
			const display = new NextionDisplay(device, { ...BASE, getTimeoutMs: 50 });
			await display.connect();

			await expect(display.get("nTemp")).rejects.toThrow("no reply");
		});

		it("throws on an unterminated reply that fills the buffer", async () => {
			const { device } = makeDevice();
			queueReplies(device, {
				data: Array.from({ length: 64 }, () => "0x41"),
			});
			const display = new NextionDisplay(device, {
				...BASE,
				getBufferSize: 64,
			});
			await display.connect();

			await expect(display.get("nTemp")).rejects.toThrow("exceeded 64 bytes");
		});

		it("throws when the reply ends without a terminator", async () => {
			const { device } = makeDevice();
			// One short burst, then a quiet bus - the reply is complete but
			// was never frame-terminated.
			queueReplies(device, { data: ["0x32", "0x35"], bytes_read: 2 });
			const display = new NextionDisplay(device, {
				...BASE,
				getTimeoutMs: 500,
			});
			await display.connect();

			await expect(display.get("nTemp")).rejects.toThrow(
				"ended without a terminator",
			);
		});

		it("surfaces command errors", async () => {
			const { device } = makeDevice();
			const uartRead = device.uartRead as ReturnType<typeof vi.fn>;
			uartRead.mockResolvedValueOnce({
				id: "reply",
				type: "command_error",
				payload: { command_type: "uart_read", error: "UART read failed" },
			});
			const display = new NextionDisplay(device, BASE);
			await display.connect();

			await expect(display.get("nTemp")).rejects.toThrow("UART read failed");
		});
	});

	describe("getNumber", () => {
		it("parses decimal replies", async () => {
			const { device } = makeDevice();
			queueReplies(device, {
				data: ["0x32", "0x35", "0xFF", "0xFF", "0xFF"],
			});
			const display = new NextionDisplay(device, BASE);
			await display.connect();

			await expect(display.getNumber("nTemp")).resolves.toBe(25);
		});

		it("parses hex replies", async () => {
			const { device } = makeDevice();
			queueReplies(device, {
				data: ["0x30", "0x78", "0x31", "0x39", "0xFF", "0xFF", "0xFF"],
			});
			const display = new NextionDisplay(device, BASE);
			await display.connect();

			await expect(display.getNumber("nTemp")).resolves.toBe(25);
		});

		it("throws on unparseable replies", async () => {
			const { device } = makeDevice();
			queueReplies(device, {
				data: ["0x41", "0x42", "0xFF", "0xFF", "0xFF"],
			});
			const display = new NextionDisplay(device, BASE);
			await display.connect();

			await expect(display.getNumber("nTemp")).rejects.toThrow("cannot parse");
		});
	});
});
