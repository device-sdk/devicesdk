import {
	DeviceSDKApiError,
	type DeviceStatus,
	getDeviceStatus,
	listDevices,
} from "../api.js";
import { requireAuth } from "../credentials.js";
import { EXIT } from "../exitCodes.js";
import { loadConfig } from "../utils.js";

interface StatusOptions {
	project?: string;
	device?: string;
	config?: string;
}

function formatRelativeTime(ms: number): string {
	const seconds = Math.floor((Date.now() - ms) / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function formatLastSeen(status: DeviceStatus): string {
	if (status.connected && status.connected_since !== null) {
		return `connected ${formatRelativeTime(status.connected_since)}`;
	}
	if (status.last_connected_at !== null) {
		return formatRelativeTime(status.last_connected_at);
	}
	return "never";
}

function formatVersion(versionId: string | null): string {
	if (!versionId) return "—";
	return versionId.slice(0, 8);
}

export default async function status(
	options: StatusOptions = {},
): Promise<void> {
	try {
		const token = await requireAuth();

		// Resolve project ID — from flag, or from config file
		let projectId: string;
		if (options.project) {
			projectId = options.project;
		} else {
			const config = await loadConfig(options.config);
			projectId = config.projectId;
		}

		// Fetch devices
		let devices: Awaited<ReturnType<typeof listDevices>>;
		try {
			devices = await listDevices(token, projectId);
		} catch (error) {
			if (error instanceof DeviceSDKApiError && error.statusCode === 404) {
				console.error(`✗ Project "${projectId}" not found.`);
				process.exit(EXIT.GENERIC);
			}
			throw error;
		}

		if (devices.length === 0) {
			console.log(`Project: ${projectId}\n`);
			console.log("No devices found.");
			return;
		}

		// Filter by device if requested
		let devicesToShow = devices;
		if (options.device) {
			devicesToShow = devices.filter((d) => d.device_id === options.device);
			if (devicesToShow.length === 0) {
				console.error(
					`✗ Device "${options.device}" not found in project "${projectId}".`,
				);
				process.exit(EXIT.GENERIC);
			}
		}

		// Fetch live status for each device in parallel
		// Use allSettled so a single device failure doesn't abort the whole command —
		// failed devices are shown with a warning indicator instead of aborting.
		const settledStatuses = await Promise.allSettled(
			devicesToShow.map((d) => getDeviceStatus(token, projectId, d.device_id)),
		);
		const statuses: DeviceStatus[] = settledStatuses.map((result) =>
			result.status === "fulfilled"
				? result.value
				: {
						connected: false,
						connected_since: null,
						last_connected_at: null,
						current_version_id: null,
					},
		);
		const statusErrors: boolean[] = settledStatuses.map(
			(result) => result.status === "rejected",
		);

		const rows = devicesToShow.map((device, i) => ({ device, s: statuses[i] }));

		// Compute column widths
		const maxDeviceLen = Math.max(
			6, // "DEVICE"
			...rows.map((r) => r.device.device_id.length),
		);
		const maxVersionLen = Math.max(
			7, // "VERSION"
			...rows.map((r) => formatVersion(r.s.current_version_id).length),
		);
		const maxLastSeenLen = Math.max(
			9, // "LAST SEEN"
			...statuses.map((s) => formatLastSeen(s).length),
		);

		// Print header
		console.log(`Project: ${projectId}\n`);
		const header = [
			"  DEVICE".padEnd(maxDeviceLen + 2),
			"STATUS    ",
			"VERSION".padEnd(maxVersionLen + 2),
			"LAST SEEN".padEnd(maxLastSeenLen),
		].join("  ");
		console.log(header);
		const divider = `  ${"─".repeat(header.length - 2)}`;
		console.log(divider);

		// Print each device row
		for (let i = 0; i < devicesToShow.length; i++) {
			const device = devicesToShow[i];
			const s = statuses[i];

			const dot = statusErrors[i]
				? "⚠ error  "
				: s.connected
					? "● online "
					: "○ offline";
			const version = formatVersion(s.current_version_id).padEnd(
				maxVersionLen + 2,
			);
			const lastSeen = formatLastSeen(s).padEnd(maxLastSeenLen);

			console.log(
				`  ${device.device_id.padEnd(maxDeviceLen)}  ${dot}  ${version}  ${lastSeen}`,
			);
		}

		console.log("");
	} catch (error) {
		if (error instanceof DeviceSDKApiError) {
			console.error(`✗ Error: ${error.message}`);
			process.exit(EXIT.GENERIC);
		}
		throw error;
	}
}
