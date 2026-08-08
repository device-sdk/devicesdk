import fs from "node:fs/promises";
import os from "node:os";
import { type ExecaError, execa } from "execa";

export interface ESP32FlashOptions {
	firmwarePath: string;
	port?: string;
	baud?: number;
	timeoutMs?: number;
	chipName?: string;
	before?: string;
}

const DEFAULT_BAUD = 460800;
const DEFAULT_TIMEOUT = 60_000;

// Shared by the wait-timeout and pre-flash permission checks so both failure
// paths point at the same fix.
const SERIAL_PERMISSION_GUIDANCE =
	"Fix with:  sudo usermod -a -G dialout $USER  (Debian/Ubuntu/Fedora)\n" +
	"          sudo usermod -a -G uucp $USER     (Arch Linux)\n" +
	"Then log out and back in for the group change to take effect.\n" +
	"For a persistent udev-rule alternative, see:\n" +
	"  https://docs.devicesdk.com/cli/flash/#serial-port-permissions-linux";

function startSpinner(text: string): () => void {
	// ANSI \r frames are meaningless when stdout is piped (CI, scripts) -
	// gate the spinner on a TTY and leave a plain "Flashing..." line instead.
	if (!process.stdout.isTTY) return () => {};
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
	// Snapshot the ports that already exist when the wait starts: a port that
	// was present before (an unrelated USB serial device, or a board the user
	// plugged in earlier) must never be selected. Only a port that APPEARS
	// after the wait started is the one the user just plugged in.
	const initial = new Set(await listSerialPorts());
	while (Date.now() - start < timeoutMs) {
		const ports = await listSerialPorts();
		const fresh = ports.filter((port) => !initial.has(port));
		if (fresh.length === 1) return fresh[0];
		if (fresh.length > 1) {
			throw new Error(
				`Multiple new serial ports detected: ${fresh.join(", ")}.\n` +
					"Disconnect the extra devices and try again, or pass --port to select one explicitly.",
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	const preExisting = [...initial];
	if (preExisting.length > 0) {
		// The board was already connected when the wait started, so no new
		// port can appear. Name it instead of a generic "not connected" hint,
		// and surface the dialout fix if it is not writable.
		for (const port of preExisting) {
			try {
				await fs.access(port, fs.constants.R_OK | fs.constants.W_OK);
			} catch {
				throw new Error(
					`Found ${preExisting.join(", ")} - ${port} is not writable (permission denied).\n` +
						`Unplug and replug the board, or pass --port to flash it directly.\n` +
						SERIAL_PERMISSION_GUIDANCE,
				);
			}
		}
		throw new Error(
			`Found ${preExisting.join(", ")} already connected - unplug and replug the board, or pass --port to flash it directly.`,
		);
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
				SERIAL_PERMISSION_GUIDANCE,
		);
	}

	const args: string[] = [
		"--chip",
		options.chipName ?? "esp32",
		"--port",
		port,
		"--baud",
		String(baud),
		"--before",
		options.before ?? "default_reset",
		"--after",
		"hard_reset",
		"write_flash",
		// esptool v4 does not verify writes by default; verify explicitly so a
		// silently corrupted flash is caught right after writing.
		"--verify",
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
