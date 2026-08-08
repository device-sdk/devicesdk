import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";

export interface PicoFlashOptions {
	firmwarePath: string;
	volumeLabel?: string | string[]; // default RPI-RP2 or RP2350
	timeoutMs?: number; // default 120000
}

const DEFAULT_LABELS = ["RPI-RP2", "RP2350"];
const DEFAULT_TIMEOUT = 120_000;

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

export async function listVolumes(): Promise<
	Array<{ mountpoint: string; label?: string }>
> {
	const platform = os.platform();

	if (platform === "darwin") {
		const { stdout } = await execa("diskutil", ["info", "-all"]);
		const lines = stdout.split("\n");
		const volumes: Array<{ mountpoint: string; label?: string }> = [];
		let current: { mountpoint?: string; label?: string } = {};
		for (const line of lines) {
			const [key, ...rest] = line.split(":");
			if (!key || rest.length === 0) continue;
			const value = rest.join(":").trim();
			const trimmedKey = key.trim();
			if (trimmedKey === "Device Identifier") {
				current = {};
			} else if (trimmedKey === "Volume Name") {
				current.label = value;
			} else if (trimmedKey === "Mount Point") {
				current.mountpoint = value;
			} else if (
				trimmedKey === "Partition Type" &&
				current.mountpoint &&
				current.label !== undefined
			) {
				volumes.push({ mountpoint: current.mountpoint, label: current.label });
				current = {};
			}
		}
		return volumes.filter(
			(v) => v.mountpoint && v.mountpoint !== "Not mounted",
		);
	}

	if (platform === "linux") {
		const { stdout } = await execa("lsblk", [
			"-o",
			"NAME,LABEL,MOUNTPOINT",
			"-P",
			"-p",
		]);
		return stdout
			.split("\n")
			.map((line) => {
				// Use the capture groups directly: splitting each `KEY="value"`
				// pair on "=" would truncate labels/mountpoints that contain "=".
				const parts = Object.fromEntries(
					[...line.matchAll(/([A-Z]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
				);
				return {
					label: parts.LABEL || undefined,
					mountpoint: parts.MOUNTPOINT || undefined,
				} as { label?: string; mountpoint?: string };
			})
			.filter((v): v is { label?: string; mountpoint: string } =>
				Boolean(v.mountpoint),
			);
	}

	if (platform === "win32") {
		// The RP2040/RP2350 bootloader exposes itself as a removable drive
		// letter on Windows. Enumerate removable volumes via PowerShell and
		// emit `DriveLetter|FileSystemLabel` per line, which is parsed into the
		// same { mountpoint, label } shape the copy code expects.
		const { stdout } = await execa("powershell", [
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			"Get-Volume | Where-Object DriveType -eq 'Removable' | ForEach-Object { \"$($_.DriveLetter)|$($_.FileSystemLabel)\" }",
		]);
		return stdout
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.flatMap((line) => {
				const [letter, label] = line.split("|");
				if (!letter) return [];
				return [
					{ mountpoint: `${letter}:\\`, label: label?.trim() || undefined },
				];
			});
	}

	throw new Error(`Unsupported platform: ${platform}`);
}

async function findPicoMount(
	volumeLabel: string | string[],
	timeoutMs: number,
): Promise<string> {
	const labels = Array.isArray(volumeLabel) ? volumeLabel : [volumeLabel];
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const volumes = await listVolumes();
		const match = volumes.find(
			(v) =>
				labels.some((label) => (v.label || "").trim() === label) &&
				v.mountpoint,
		);
		if (match?.mountpoint) {
			return match.mountpoint;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(
		`Timed out waiting for Pico volume "${labels.join('" or "')}"`,
	);
}

export async function flashPico(
	options: PicoFlashOptions,
): Promise<{ mountpoint: string }> {
	const volumeLabel = options.volumeLabel || DEFAULT_LABELS;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;

	const mountpoint = await findPicoMount(volumeLabel, timeoutMs);
	console.log(`\n✓ Device found at ${mountpoint}`);
	console.log("Starting flash...");

	const stopSpinner = startSpinner("Flashing");

	const targetPath = path.join(mountpoint, path.basename(options.firmwarePath));
	const sourceSize = (await fs.stat(options.firmwarePath)).size;
	await fs.copyFile(options.firmwarePath, targetPath);
	// Poll until the copied file reaches the full firmware size instead of
	// sleeping a fixed 500ms: antivirus scanners or slow mounts can delay the
	// flush, and a partial copy would brick the board. The RP2350 bootloader
	// deletes the file once ingested, so a missing file counts as done - but
	// only after the full size was observed at least once; a file that
	// disappears before that is a failed copy, not a successful one.
	const deadline = Date.now() + 5_000;
	let sawFullSize = false;
	while (true) {
		let vanished = false;
		try {
			if ((await fs.stat(targetPath)).size === sourceSize) {
				sawFullSize = true;
				break;
			}
		} catch {
			vanished = true;
			if (sawFullSize) break; // consumed by the bootloader
		}
		if (Date.now() > deadline) {
			stopSpinner();
			if (vanished) {
				throw new Error(
					`Firmware copy to ${targetPath} vanished before the copy completed - replug the board and retry.`,
				);
			}
			throw new Error(
				`Firmware copy to ${targetPath} did not complete before the deadline.`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}

	stopSpinner();

	console.log("Flash complete, Device will automatically restart.");

	return { mountpoint };
}
