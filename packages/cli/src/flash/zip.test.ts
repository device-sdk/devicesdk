import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { extractESP32Firmware } from "./zip.js";

function createTestZip(files: Record<string, string | Buffer>): Buffer {
	const zip = new AdmZip();
	for (const [name, content] of Object.entries(files)) {
		if (typeof content === "string") {
			zip.addFile(name, Buffer.from(content, "utf-8"));
		} else {
			zip.addFile(name, content);
		}
	}
	return zip.toBuffer();
}

describe("extractESP32Firmware", () => {
	it("extracts valid firmware archive", () => {
		const flasherArgs = {
			chip: "esp32",
			flash_mode: "dio",
			flash_size: "2MB",
			flash_freq: "40m",
			before: "default_reset",
			after: "hard_reset",
			flash_files: {
				"0x1000": "bootloader.bin",
				"0x8000": "partition-table.bin",
				"0x10000": "app.bin",
			},
		};

		const zipBuffer = createTestZip({
			"flasher_args.json": JSON.stringify(flasherArgs),
			"bootloader.bin": Buffer.from([0x00, 0x01, 0x02]),
			"partition-table.bin": Buffer.from([0x03, 0x04, 0x05]),
			"app.bin": Buffer.from([0x06, 0x07, 0x08]),
		});

		const firmware = extractESP32Firmware(zipBuffer);

		expect(firmware.flasherArgs).toEqual(flasherArgs);
		expect(firmware.files["bootloader.bin"]).toEqual(
			Buffer.from([0x00, 0x01, 0x02]),
		);
		expect(firmware.files["partition-table.bin"]).toEqual(
			Buffer.from([0x03, 0x04, 0x05]),
		);
		expect(firmware.files["app.bin"]).toEqual(Buffer.from([0x06, 0x07, 0x08]));
	});

	it("throws when flasher_args.json is missing", () => {
		const zipBuffer = createTestZip({
			"bootloader.bin": Buffer.from([0x00, 0x01]),
		});

		expect(() => extractESP32Firmware(zipBuffer)).toThrow(
			"missing flasher_args.json",
		);
	});

	it("throws when expected binary file is missing", () => {
		const flasherArgs = {
			chip: "esp32",
			flash_mode: "dio",
			flash_size: "2MB",
			flash_freq: "40m",
			before: "default_reset",
			after: "hard_reset",
			flash_files: {
				"0x1000": "bootloader.bin",
				"0x10000": "app.bin",
			},
		};

		const zipBuffer = createTestZip({
			"flasher_args.json": JSON.stringify(flasherArgs),
			"bootloader.bin": Buffer.from([0x00, 0x01]),
			// app.bin is missing
		});

		expect(() => extractESP32Firmware(zipBuffer)).toThrow("missing app.bin");
	});

	it("ignores extra files in archive", () => {
		const flasherArgs = {
			chip: "esp32",
			flash_mode: "dio",
			flash_size: "2MB",
			flash_freq: "40m",
			before: "default_reset",
			after: "hard_reset",
			flash_files: {
				"0x1000": "bootloader.bin",
			},
		};

		const zipBuffer = createTestZip({
			"flasher_args.json": JSON.stringify(flasherArgs),
			"bootloader.bin": Buffer.from([0x00, 0x01]),
			"extra.bin": Buffer.from([0xff]),
			"readme.txt": "some text",
		});

		const firmware = extractESP32Firmware(zipBuffer);
		expect(firmware.flasherArgs).toEqual(flasherArgs);
		expect(firmware.files["bootloader.bin"]).toBeDefined();
		expect(firmware.files["extra.bin"]).toBeDefined();
	});
});
