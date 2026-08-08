import { describe, expect, it, vi } from "vitest";
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

	describe("instruction encoding", () => {
		const { device, calls } = makeDevice();
		const display = new NextionDisplay(device, {
			port: 2,
			txPin: 17,
			rxPin: 16,
			baudRate: 115200,
		});

		it("connect configures the UART port", async () => {
			await display.connect();
			expect(calls.at(-1)).toEqual({
				method: "uartConfigure",
				args: [2, 17, 16, 115200],
			});
		});

		it("appends the frame terminator to every instruction", async () => {
			await display.setPage(0);
			const { args } = calls.at(-1)!;
			expect(args[0]).toBe(2);
			const data = args[1] as string[];
			expect(NextionDisplay.bytesToAscii(data.slice(0, -3))).toBe("page 0");
			expect(data.slice(-3)).toEqual(["0xFF", "0xFF", "0xFF"]);
		});

		it("setText escapes embedded quotes", async () => {
			await display.setText("tTitle", 'say "hi"');
			const data = calls.at(-1)!.args[1] as string[];
			expect(NextionDisplay.bytesToAscii(data.slice(0, -3))).toBe(
				'tTitle.txt="say \\"hi\\""',
			);
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
	});

	describe("get", () => {
		it("decodes a terminated reply and strips the terminator", async () => {
			const { device, calls } = makeDevice();
			const uartRead = device.uartRead as ReturnType<typeof vi.fn>;
			uartRead.mockResolvedValueOnce({
				id: "reply",
				type: "uart_read_result",
				payload: {
					port: 2,
					data: ["0x32", "0x35", "0xFF", "0xFF", "0xFF"],
					bytes_read: 5,
				},
			});
			const display = new NextionDisplay(device, {
				port: 2,
				txPin: 17,
				rxPin: 16,
			});

			await expect(display.get("nTemp.val")).resolves.toBe("25");
			expect(
				NextionDisplay.bytesToAscii(
					(calls[0].args[1] as string[]).slice(0, -3),
				),
			).toBe("get nTemp.val");
		});

		it("surfaces command errors", async () => {
			const { device } = makeDevice();
			const uartRead = device.uartRead as ReturnType<typeof vi.fn>;
			uartRead.mockResolvedValueOnce({
				id: "reply",
				type: "command_error",
				payload: { command_type: "uart_read", error: "UART read failed" },
			});
			const display = new NextionDisplay(device, {
				port: 2,
				txPin: 17,
				rxPin: 16,
			});

			await expect(display.get("nTemp.val")).rejects.toThrow(
				"UART read failed",
			);
		});
	});
});
