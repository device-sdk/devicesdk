import { type ExecaError, execa } from "execa";
import fs from "fs/promises";
import os from "os";

export interface ESP32FlashOptions {
	firmwarePath: string;
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
	} else {
		throw new Error(`Unsupported platform for ESP32 flashing: ${platform}`);
	}

	return ports;
}

async function waitForSerialPort(timeoutMs: number): Promise<string> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const ports = await listSerialPorts();
		if (ports.length > 0) return ports[0];
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(
		"No serial port detected.\n" +
			"Make sure your ESP32 is connected via USB.\n" +
			"You may need to install CP210x or CH340 USB drivers.",
	);
}

export async function flashESP32(
	options: ESP32FlashOptions,
): Promise<{ port: string }> {
	const baud = options.baud ?? DEFAULT_BAUD;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;

	const esptool = await getEsptoolCommand();

	let port: string;
	if (options.port) {
		port = options.port;
	} else {
		console.log("\nWaiting for ESP32 serial port...");
		port = await waitForSerialPort(timeoutMs);
		console.log(`\u2713 Serial port detected: ${port}`);
	}

	try {
		await fs.access(port, fs.constants.R_OK | fs.constants.W_OK);
	} catch {
		throw new Error(
			`Serial port ${port} is not accessible (permission denied).\n` +
				"Fix with:  sudo usermod -a -G dialout $USER\n" +
				"Then log out and back in for the group change to take effect.",
		);
	}

	const args: string[] = [
		"--chip",
		"esp32",
		"--port",
		port,
		"--baud",
		String(baud),
		"--before",
		"default_reset",
		"--after",
		"hard_reset",
		"write_flash",
		"0x0",
		options.firmwarePath,
	];

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
