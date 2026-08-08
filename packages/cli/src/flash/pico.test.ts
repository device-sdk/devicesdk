import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flashPico, listVolumes } from "./pico.js";

vi.mock("execa", () => ({
	execa: vi.fn(),
}));

const { execa: execaMock } = vi.mocked(await import("execa"));

const LSBLK_OUTPUT =
	'NAME="/dev/sda1" LABEL="RPI-RP2" MOUNTPOINT="/media/user/RPI-RP2"';

describe("pico flash", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("listVolumes", () => {
		it("parses lsblk output on linux (POSIX path)", async () => {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			execaMock.mockResolvedValueOnce({
				stdout: LSBLK_OUTPUT,
			} as unknown as Awaited<ReturnType<typeof execaMock>>);

			expect(await listVolumes()).toEqual([
				{ mountpoint: "/media/user/RPI-RP2", label: "RPI-RP2" },
			]);
		});

		it("enumerates removable drive letters on win32", async () => {
			vi.spyOn(os, "platform").mockReturnValue("win32");
			execaMock.mockResolvedValueOnce({
				stdout: "E|RPI-RP2\r\nF|USB Drive\r\n",
			} as unknown as Awaited<ReturnType<typeof execaMock>>);

			const volumes = await listVolumes();
			expect(volumes).toEqual([
				{ mountpoint: "E:\\", label: "RPI-RP2" },
				{ mountpoint: "F:\\", label: "USB Drive" },
			]);
			const file = execaMock.mock.calls[0][0] as string;
			const args = execaMock.mock.calls[0][1] as string[];
			expect(file).toBe("powershell");
			expect(args.join(" ")).toContain("Get-Volume");
			expect(args.join(" ")).toContain("DriveType -eq 'Removable'");
		});

		it("handles removable volumes without a label on win32", async () => {
			vi.spyOn(os, "platform").mockReturnValue("win32");
			execaMock.mockResolvedValueOnce({
				stdout: "G|\n",
			} as unknown as Awaited<ReturnType<typeof execaMock>>);

			expect(await listVolumes()).toEqual([
				{ mountpoint: "G:\\", label: undefined },
			]);
		});

		it("keeps a clear error on other platforms", async () => {
			vi.spyOn(os, "platform").mockReturnValue("freebsd");

			await expect(listVolumes()).rejects.toThrow(
				"Unsupported platform: freebsd",
			);
		});
	});

	describe("flashPico", () => {
		function mockRpiRp2Volume(): void {
			vi.spyOn(os, "platform").mockReturnValue("linux");
			execaMock.mockResolvedValueOnce({
				stdout: LSBLK_OUTPUT,
			} as unknown as Awaited<ReturnType<typeof execaMock>>);
		}

		it("copies the firmware and verifies the copied size", async () => {
			mockRpiRp2Volume();
			vi.spyOn(fs, "copyFile").mockResolvedValue(undefined as never);
			// stat: source firmware first, then target polls (partial, then full).
			vi.spyOn(fs, "stat")
				.mockResolvedValueOnce({ size: 12345 } as never)
				.mockResolvedValueOnce({ size: 100 } as never)
				.mockResolvedValueOnce({ size: 12345 } as never);

			const result = await flashPico({ firmwarePath: "/tmp/fw.uf2" });

			expect(result).toEqual({ mountpoint: "/media/user/RPI-RP2" });
			expect(fs.copyFile).toHaveBeenCalledWith(
				"/tmp/fw.uf2",
				path.join("/media/user/RPI-RP2", "fw.uf2"),
			);
		});

		it("errors when the copied file never reaches the firmware size", async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			try {
				mockRpiRp2Volume();
				vi.spyOn(fs, "copyFile").mockResolvedValue(undefined as never);
				vi.spyOn(fs, "stat")
					.mockResolvedValueOnce({ size: 12345 } as never)
					.mockResolvedValue({ size: 100 } as never);

				const promise = flashPico({ firmwarePath: "/tmp/fw.uf2" });
				// Attach the assertion before advancing so the rejection is
				// handled synchronously rather than reported as unhandled.
				const assertion = expect(promise).rejects.toThrow(/did not complete/);
				await vi.advanceTimersByTimeAsync(6_000);
				await assertion;
			} finally {
				vi.useRealTimers();
			}
		});

		it("errors when the file vanishes before reaching the full size", async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			try {
				mockRpiRp2Volume();
				vi.spyOn(fs, "copyFile").mockResolvedValue(undefined as never);
				// Source stat succeeds; every target stat fails (ENOENT) -
				// the file vanished mid-copy, which is NOT bootloader success.
				vi.spyOn(fs, "stat")
					.mockResolvedValueOnce({ size: 12345 } as never)
					.mockRejectedValue(new Error("ENOENT"));

				const promise = flashPico({ firmwarePath: "/tmp/fw.uf2" });
				const assertion = expect(promise).rejects.toThrow(
					/vanished before the copy completed - replug the board and retry/,
				);
				await vi.advanceTimersByTimeAsync(6_000);
				await assertion;
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
