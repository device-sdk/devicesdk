import fs from "node:fs/promises";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	checkEsptoolInstalled,
	flashESP32,
	getEsptoolCommand,
	listSerialPorts,
} from "./esp32.js";

vi.mock("execa", () => ({
	execa: vi.fn(),
}));

const { execa: execaMock } = vi.mocked(await import("execa"));

describe("esp32 flash", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("checkEsptoolInstalled", () => {
		it("returns true when esptool.py is available", async () => {
			execaMock.mockResolvedValueOnce(
				{} as Awaited<ReturnType<typeof execaMock>>,
			);
			expect(await checkEsptoolInstalled()).toBe(true);
			expect(execaMock).toHaveBeenCalledWith("esptool.py", ["version"]);
		});

		it("falls back to esptool when esptool.py fails", async () => {
			execaMock.mockRejectedValueOnce(new Error("not found"));
			execaMock.mockResolvedValueOnce(
				{} as Awaited<ReturnType<typeof execaMock>>,
			);
			expect(await checkEsptoolInstalled()).toBe(true);
			expect(execaMock).toHaveBeenCalledWith("esptool", ["version"]);
		});

		it("returns false when neither is available", async () => {
			execaMock.mockRejectedValueOnce(new Error("not found"));
			execaMock.mockRejectedValueOnce(new Error("not found"));
			expect(await checkEsptoolInstalled()).toBe(false);
		});
	});

	describe("getEsptoolCommand", () => {
		it("returns esptool.py when available", async () => {
			execaMock.mockResolvedValueOnce(
				{} as Awaited<ReturnType<typeof execaMock>>,
			);
			expect(await getEsptoolCommand()).toBe("esptool.py");
		});

		it("returns esptool as fallback", async () => {
			execaMock.mockRejectedValueOnce(new Error("not found"));
			execaMock.mockResolvedValueOnce(
				{} as Awaited<ReturnType<typeof execaMock>>,
			);
			expect(await getEsptoolCommand()).toBe("esptool");
		});

		it("throws when neither is available", async () => {
			execaMock.mockRejectedValueOnce(new Error("not found"));
			execaMock.mockRejectedValueOnce(new Error("not found"));
			await expect(getEsptoolCommand()).rejects.toThrow(
				"esptool.py is not installed",
			);
		});
	});

	describe("listSerialPorts", () => {
		it("lists ttyUSB and ttyACM ports on linux", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			vi.spyOn(fs, "readdir").mockResolvedValue([
				"ttyS0",
				"ttyS1",
				"ttyUSB0",
				"ttyACM0",
				"null",
			] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

			const ports = await listSerialPorts();
			expect(ports).toEqual(["/dev/ttyUSB0", "/dev/ttyACM0"]);
		});

		it("excludes legacy ttyS ports on linux", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			vi.spyOn(fs, "readdir").mockResolvedValue([
				"ttyS0",
				"ttyS1",
				"ttyS2",
				"ttyS3",
			] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

			const ports = await listSerialPorts();
			expect(ports).toEqual([]);
		});

		it("lists cu.usb ports on darwin", async () => {
			vi.spyOn(os, "platform").mockReturnValue("darwin");
			vi.spyOn(fs, "readdir").mockResolvedValue([
				"cu.usbserial-0001",
				"cu.SLAB_USBtoUART",
				"cu.Bluetooth-Incoming-Port",
				"tty.usbserial-0001",
			] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

			const ports = await listSerialPorts();
			expect(ports).toEqual([
				"/dev/cu.usbserial-0001",
				"/dev/cu.SLAB_USBtoUART",
			]);
		});

		it("returns empty when /dev is not readable", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			vi.spyOn(fs, "readdir").mockRejectedValue(new Error("EACCES"));

			const ports = await listSerialPorts();
			expect(ports).toEqual([]);
		});

		it("throws on unsupported platform", async () => {
			vi.spyOn(os, "platform").mockReturnValue("win32");
			await expect(listSerialPorts()).rejects.toThrow("Unsupported platform");
		});
	});

	describe("flashESP32", () => {
		beforeEach(() => {
			// getEsptoolCommand: make esptool.py available
			execaMock.mockResolvedValueOnce(
				{} as Awaited<ReturnType<typeof execaMock>>,
			);
		});

		it("passes --port to esptool with explicit port", async () => {
			vi.spyOn(fs, "access").mockResolvedValue();
			// esptool flash call
			execaMock.mockResolvedValueOnce(
				{} as Awaited<ReturnType<typeof execaMock>>,
			);

			const result = await flashESP32({
				firmwarePath: "/tmp/fw.bin",
				port: "/dev/ttyUSB0",
			});

			expect(result).toEqual({ port: "/dev/ttyUSB0" });
			// Second execa call is the actual flash. --verify must NOT be
			// passed: esptool verifies writes by default (v4+), and v5 removed
			// the flag entirely (passing it aborts with an unknown-arg error).
			expect(execaMock).toHaveBeenCalledWith(
				"esptool.py",
				expect.arrayContaining(["--port", "/dev/ttyUSB0"]),
				{ stdio: "pipe" },
			);
			const flashCall = execaMock.mock.calls.find(
				(call) =>
					Array.isArray(call[1]) &&
					(call[1] as string[]).includes("write_flash"),
			);
			expect(flashCall?.[1]).not.toContain("--verify");
		});

		it("auto-detects a port that appears after the wait starts", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			// First readdir call snapshots the pre-existing ports (none); the
			// second poll sees the freshly plugged-in board.
			const readdirMock = vi.spyOn(fs, "readdir");
			readdirMock.mockResolvedValueOnce(
				[] as unknown as Awaited<ReturnType<typeof fs.readdir>>,
			);
			readdirMock.mockResolvedValueOnce(["ttyUSB0"] as unknown as Awaited<
				ReturnType<typeof fs.readdir>
			>);
			vi.spyOn(fs, "access").mockResolvedValue();
			// esptool flash call
			execaMock.mockResolvedValueOnce(
				{} as Awaited<ReturnType<typeof execaMock>>,
			);

			const result = await flashESP32({
				firmwarePath: "/tmp/fw.bin",
			});

			expect(result).toEqual({ port: "/dev/ttyUSB0" });
			expect(execaMock).toHaveBeenCalledWith(
				"esptool.py",
				expect.arrayContaining(["--port", "/dev/ttyUSB0"]),
				{ stdio: "pipe" },
			);
		});

		it("names pre-existing ports on timeout instead of a generic message", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			// A board plugged in before the wait started must never be
			// selected, but the timeout must name it so the user knows the
			// board WAS detected.
			const readdirMock = vi.spyOn(fs, "readdir");
			readdirMock.mockResolvedValue(["ttyUSB0"] as unknown as Awaited<
				ReturnType<typeof fs.readdir>
			>);
			vi.spyOn(fs, "access").mockResolvedValue();

			await expect(
				flashESP32({ firmwarePath: "/tmp/fw.bin", timeoutMs: 50 }),
			).rejects.toThrow(
				/Found \/dev\/ttyUSB0 already connected - unplug and replug the board, or pass --port/,
			);
		});

		it("surfaces the dialout fix when a pre-existing port is not writable", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			const readdirMock = vi.spyOn(fs, "readdir");
			readdirMock.mockResolvedValue(["ttyUSB0"] as unknown as Awaited<
				ReturnType<typeof fs.readdir>
			>);
			// The permission probe in waitForSerialPort rejects; the flash
			// never starts so esptool is never invoked.
			vi.spyOn(fs, "access").mockRejectedValue(new Error("EACCES"));

			const promise = flashESP32({
				firmwarePath: "/tmp/fw.bin",
				timeoutMs: 50,
			});
			await expect(promise).rejects.toThrow(
				/\/dev\/ttyUSB0 is not writable \(permission denied\)/,
			);
			await expect(promise).rejects.toThrow(/sudo usermod -a -G dialout/);
			expect(execaMock).toHaveBeenCalledTimes(1);
		});

		it("errors instead of guessing when multiple new ports appear", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			const readdirMock = vi.spyOn(fs, "readdir");
			readdirMock.mockResolvedValueOnce(
				[] as unknown as Awaited<ReturnType<typeof fs.readdir>>,
			);
			readdirMock.mockResolvedValueOnce([
				"ttyUSB0",
				"ttyUSB1",
			] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
			vi.spyOn(fs, "access").mockResolvedValue();

			await expect(
				flashESP32({ firmwarePath: "/tmp/fw.bin", timeoutMs: 10_000 }),
			).rejects.toThrow(
				/Multiple new serial ports detected: \/dev\/ttyUSB0, \/dev\/ttyUSB1/,
			);
		});

		it("throws permission error when port is not accessible", async () => {
			vi.spyOn(fs, "access").mockRejectedValue(new Error("EACCES"));

			await expect(
				flashESP32({
					firmwarePath: "/tmp/fw.bin",
					port: "/dev/ttyUSB0",
				}),
			).rejects.toThrow(/not accessible \(permission denied\)/);
		});

		it("includes dialout fix in permission error message", async () => {
			vi.spyOn(fs, "access").mockRejectedValue(new Error("EACCES"));

			await expect(
				flashESP32({
					firmwarePath: "/tmp/fw.bin",
					port: "/dev/ttyUSB0",
				}),
			).rejects.toThrow(/sudo usermod -a -G dialout/);
		});

		it("does not invoke esptool when port is inaccessible", async () => {
			vi.spyOn(fs, "access").mockRejectedValue(new Error("EACCES"));

			await expect(
				flashESP32({
					firmwarePath: "/tmp/fw.bin",
					port: "/dev/ttyUSB0",
				}),
			).rejects.toThrow();

			// Only the version check call, no flash call
			expect(execaMock).toHaveBeenCalledTimes(1);
			expect(execaMock).toHaveBeenCalledWith("esptool.py", ["version"]);
		});

		it("uses custom baud rate", async () => {
			vi.spyOn(fs, "access").mockResolvedValue();
			execaMock.mockResolvedValueOnce(
				{} as Awaited<ReturnType<typeof execaMock>>,
			);

			await flashESP32({
				firmwarePath: "/tmp/fw.bin",
				port: "/dev/ttyUSB0",
				baud: 115200,
			});

			expect(execaMock).toHaveBeenCalledWith(
				"esptool.py",
				expect.arrayContaining(["--baud", "115200"]),
				{ stdio: "pipe" },
			);
		});

		it("throws on esptool failure with stderr", async () => {
			vi.spyOn(fs, "access").mockResolvedValue();
			const err = Object.assign(new Error("process failed"), {
				stderr: "A fatal error occurred",
			});
			execaMock.mockRejectedValueOnce(err);

			await expect(
				flashESP32({
					firmwarePath: "/tmp/fw.bin",
					port: "/dev/ttyUSB0",
				}),
			).rejects.toThrow("Flash failed: A fatal error occurred");
		});
	});
});
