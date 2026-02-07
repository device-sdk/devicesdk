import { type ExecaError, execa } from "execa";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ESP32Firmware } from "../api.js";
import { extractESP32Firmware, writeFirmwareFiles } from "./zip.js";

export interface ESP32FlashOptions {
	firmwareZip: Buffer;
	outputDir: string;
	port?: string;
	baud?: number;
	timeoutMs?: number;
}

const DEFAULT_BAUD = 460800;
const DEFAULT_TIMEOUT = 60_000;

function startSpinner(text: string): () => void {
	const frames = ["|", "/", "-", "\\"];
	let idx = 0;
	process.stdout.write(`${text} ${frames[idx]}`);
	const interval = setInterval(() => {
		idx = (idx + 1) % frames.length;
		process.stdout.write(`\r${text} ${frames[idx]}`);
	}, 120);
	return () => {
		clearInterval(interval);
		process.stdout.write(`\r${text} \u2713\n`);
	};
}

export async function checkEsptoolInstalled(): Promise<boolean> {
	try {
		await execa("esptool.py", ["version"]);
		return true;
	} catch {
		try {
			await execa("esptool", ["version"]);
			return true;
		} catch {
			return false;
		}
	}
}

export async function getEsptoolCommand(): Promise<string> {
	try {
		await execa("esptool.py", ["version"]);
		return "esptool.py";
	} catch {
		try {
			await execa("esptool", ["version"]);
			return "esptool";
		} catch {
			throw new Error(
				"esptool.py is not installed or not in PATH.\n" +
					"Install it with: pip install esptool\n" +
					"Or see: https://docs.espressif.com/projects/esptool/en/latest/",
			);
		}
	}
}

export async function listSerialPorts(): Promise<string[]> {
	const platform = os.platform();
	const ports: string[] = [];

	if (platform === "darwin") {
		try {
			const devDir = await fs.readdir("/dev");
			for (const entry of devDir) {
				if (
					entry.startsWith("cu.usb") ||
					entry.startsWith("cu.SLAB_USBtoUART") ||
					entry.startsWith("cu.wchusbserial")
				) {
					ports.push(`/dev/${entry}`);
				}
			}
		} catch {
			// /dev not readable, return empty
		}
	} else if (platform === "linux") {
		try {
			const devDir = await fs.readdir("/dev");
			for (const entry of devDir) {
				if (entry.startsWith("ttyUSB") || entry.startsWith("ttyACM")) {
					ports.push(`/dev/${entry}`);
				}
			}
		} catch {
			// /dev not readable, return empty
		}

		// Also check /dev/serial/by-id for more descriptive names
		try {
			const serialDir = await fs.readdir("/dev/serial/by-id");
			for (const entry of serialDir) {
				ports.push(`/dev/serial/by-id/${entry}`);
			}
		} catch {
			// No serial by-id directory
		}
	} else {
		throw new Error(`Unsupported platform for ESP32 flashing: ${platform}`);
	}

	return ports;
}

export async function detectESP32Port(
	timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<string> {
	const start = Date.now();

	while (Date.now() - start < timeoutMs) {
		const ports = await listSerialPorts();

		if (ports.length === 1) {
			return ports[0];
		}

		if (ports.length > 1) {
			throw new Error(
				`Multiple serial ports detected:\n${ports.map((p) => `  - ${p}`).join("\n")}\n\n` +
					"Please specify the port with --port <port>",
			);
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw new Error(
		"No ESP32 serial port detected.\n" +
			"Make sure your ESP32 is connected via USB.\n" +
			"You may need to install CP210x or CH340 USB drivers.",
	);
}

export async function flashESP32(
	options: ESP32FlashOptions,
): Promise<{ port: string }> {
	const baud = options.baud ?? DEFAULT_BAUD;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;

	// Verify esptool is installed
	const esptool = await getEsptoolCommand();

	// Extract firmware from ZIP
	console.log("Extracting firmware...");
	const firmware = extractESP32Firmware(options.firmwareZip);

	// Write files to disk
	const writtenPaths = await writeFirmwareFiles(firmware, options.outputDir);

	// Detect or use specified port
	let port = options.port;
	if (!port) {
		console.log("\nSearching for ESP32 device...");
		port = await detectESP32Port(timeoutMs);
		console.log(`\u2713 Device found at ${port}`);
	}

	// Build esptool command arguments
	const args: string[] = [
		"--chip",
		firmware.flasherArgs.chip,
		"--port",
		port,
		"--baud",
		String(baud),
		"--before",
		firmware.flasherArgs.before,
		"--after",
		firmware.flasherArgs.after,
		"write_flash",
		"--flash_mode",
		firmware.flasherArgs.flash_mode,
		"--flash_size",
		firmware.flasherArgs.flash_size,
		"--flash_freq",
		firmware.flasherArgs.flash_freq,
	];

	// Add flash file addresses and paths
	for (const [address, filename] of Object.entries(
		firmware.flasherArgs.flash_files,
	)) {
		args.push(address, writtenPaths[filename]);
	}

	console.log("\nStarting flash...");
	const stopSpinner = startSpinner("Flashing");

	try {
		await execa(esptool, args, { stdio: "pipe" });
		stopSpinner();
		console.log("Flash complete. Device will automatically restart.");
		return { port };
	} catch (error) {
		stopSpinner();
		if (error instanceof Error && "stderr" in error) {
			const execaErr = error as ExecaError;
			throw new Error(`Flash failed: ${execaErr.stderr || execaErr.message}`);
		}
		throw error;
	}
}
