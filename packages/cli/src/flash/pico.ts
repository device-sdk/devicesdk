import { execa } from "execa";
import fs from "fs/promises";
import os from "os";
import path from "path";

export interface PicoFlashOptions {
	firmwarePath: string;
	volumeLabel?: string | string[]; // default RPI-RP2 or RP2350
	timeoutMs?: number; // default 120000
}

const DEFAULT_LABELS = ["RPI-RP2", "RP2350"];
const DEFAULT_TIMEOUT = 120_000;

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
		process.stdout.write(`\r${text} ✓\n`);
	};
}

async function listVolumes(): Promise<
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
				const parts = Object.fromEntries(
					line.match(/([A-Z]+)="([^"]*)"/g)?.map((part) => {
						const [k, v] = part.split("=");
						return [k, v.replace(/"/g, "")];
					}) || [],
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
	await fs.copyFile(options.firmwarePath, targetPath);
	await fs.stat(targetPath); // ensure copy completed
	await new Promise((resolve) => setTimeout(resolve, 500)); // give the device a moment to ingest

	stopSpinner();

	console.log("Flash complete, Device will automatically restart.");

	return { mountpoint };
}
