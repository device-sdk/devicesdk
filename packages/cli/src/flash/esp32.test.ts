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
			// Second execa call is the actual flash
			expect(execaMock).toHaveBeenCalledWith(
				"esptool.py",
				expect.arrayContaining(["--port", "/dev/ttyUSB0"]),
				{ stdio: "pipe" },
			);
		});

		it("auto-detects port and passes --port to esptool", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			vi.spyOn(fs, "readdir").mockResolvedValue([
				"ttyUSB0",
			] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
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

		it("picks first port when multiple ttyUSB ports exist", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			vi.spyOn(fs, "readdir").mockResolvedValue([
				"ttyUSB0",
				"ttyUSB1",
			] as unknown as Awaited<ReturnType<typeof fs.readdir>>);
			vi.spyOn(fs, "access").mockResolvedValue();
			execaMock.mockResolvedValueOnce(
				{} as Awaited<ReturnType<typeof execaMock>>,
			);

			const result = await flashESP32({
				firmwarePath: "/tmp/fw.bin",
			});

			expect(result).toEqual({ port: "/dev/ttyUSB0" });
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
