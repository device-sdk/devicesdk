import {
	DeviceSDKApiError,
	type DeviceStatus,
	getDeviceStatus,
	listDevices,
} from "../api.js";
import { requireAuth } from "../credentials.js";
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
				process.exit(1);
			}
			throw error;
		}

		if (devices.length === 0) {
			console.log(`Project: ${projectId}\n`);
			console.log("No devices found.");
			process.exit(3);
		}

		// Filter by device if requested
		let devicesToShow = devices;
		if (options.device) {
			devicesToShow = devices.filter((d) => d.device_id === options.device);
			if (devicesToShow.length === 0) {
				console.error(
					`✗ Device "${options.device}" not found in project "${projectId}".`,
				);
				process.exit(1);
			}
		}

		// Fetch live status for each device in parallel; partial failures show as offline
		const settledStatuses = await Promise.allSettled(
			devicesToShow.map((d) => getDeviceStatus(token, projectId, d.device_id)),
		);
		const rows = devicesToShow.map((device, i) => {
			const result = settledStatuses[i];
			const s: DeviceStatus =
				result.status === "fulfilled"
					? result.value
					: {
							connected: false,
							connected_since: null,
							last_connected_at: null,
							current_version_id: null,
						};
			return { device, s };
		});

		// Pre-compute formatted last-seen strings once for consistent Date.now() snapshot.
		// Use error sentinel for devices whose fetch failed.
		const formattedLastSeen = results.map((r) =>
			r.status === "fulfilled" ? formatLastSeen(r.value) : "✗ error",
		);

		// Compute column widths from successfully fetched statuses only
		const maxDeviceLen = Math.max(
			6, // "DEVICE"
			...rows.map(({ device }) => device.device_id.length),
		);
		const maxVersionLen = Math.max(
			7, // "VERSION"
			...rows.map(({ s }) => formatVersion(s.current_version_id).length),
		);
		const maxLastSeenLen = Math.max(
			9, // "LAST SEEN"
			...rows.map(({ s }) => formatLastSeen(s).length),
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
		for (const { device, s } of rows) {
			const dot = s.connected ? "● online " : "○ offline";
			const version = formatVersion(s.current_version_id).padEnd(
				maxVersionLen + 2,
			);
			const lastSeen = formattedLastSeen[i].padEnd(maxLastSeenLen);

			console.log(
				`  ${device.device_id.padEnd(maxDeviceLen)}  ${dot}  ${version}  ${lastSeen}`,
			);
		}

		console.log("");
	} catch (error) {
		if (error instanceof DeviceSDKApiError) {
			console.error(`✗ Error: ${error.message}`);
			process.exit(1);
		}
		throw error;
	}
}
