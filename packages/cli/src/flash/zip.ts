import AdmZip from "adm-zip";
import fs from "fs/promises";
import path from "path";
import type { ESP32Firmware, ESP32FlasherArgs } from "../api.js";

export function extractESP32Firmware(zipBuffer: Buffer): ESP32Firmware {
	const zip = new AdmZip(zipBuffer);
	const entries = zip.getEntries();

	let flasherArgs: ESP32FlasherArgs | undefined;
	const files: Record<string, Buffer> = {};

	for (const entry of entries) {
		const name = entry.entryName;
		if (entry.isDirectory) continue;

		if (name === "flasher_args.json") {
			const content = entry.getData().toString("utf-8");
			flasherArgs = JSON.parse(content) as ESP32FlasherArgs;
		} else if (name.endsWith(".bin")) {
			files[name] = entry.getData();
		}
	}

	if (!flasherArgs) {
		throw new Error(
			"Invalid ESP32 firmware archive: missing flasher_args.json",
		);
	}

	// Validate all expected files are present
	for (const [address, filename] of Object.entries(flasherArgs.flash_files)) {
		if (!files[filename]) {
			throw new Error(
				`Invalid ESP32 firmware archive: missing ${filename} (expected at ${address})`,
			);
		}
	}

	return { flasherArgs, files };
}

export async function writeFirmwareFiles(
	firmware: ESP32Firmware,
	outputDir: string,
): Promise<Record<string, string>> {
	await fs.mkdir(outputDir, { recursive: true });

	const writtenPaths: Record<string, string> = {};

	// Write flasher_args.json
	const argsPath = path.join(outputDir, "flasher_args.json");
	await fs.writeFile(argsPath, JSON.stringify(firmware.flasherArgs, null, 2));
	writtenPaths["flasher_args.json"] = argsPath;

	// Write all binary files
	for (const [filename, buffer] of Object.entries(firmware.files)) {
		const filePath = path.join(outputDir, filename);
		await fs.writeFile(filePath, buffer);
		writtenPaths[filename] = filePath;
	}

	return writtenPaths;
}
