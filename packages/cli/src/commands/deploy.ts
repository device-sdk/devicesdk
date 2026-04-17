import fs from "node:fs/promises";
import path from "node:path";
import {
	createProject,
	DeviceSDKApiError,
	getProject,
	uploadScript,
	uploadScriptsBatch,
	upsertDeviceEntities,
} from "../api.js";
import { requireAuth } from "../credentials.js";
import { EXIT } from "../exitCodes.js";
import { getConfigDir, loadConfig } from "../utils.js";
import { buildDevice, formatSize } from "./build.js";

interface DeployOptions {
	device?: string;
	message?: string;
	dryRun?: boolean;
	config?: string;
}

async function ensureProjectExists(
	token: string,
	projectId: string,
): Promise<void> {
	try {
		await getProject(token, projectId);
	} catch (error) {
		if (error instanceof DeviceSDKApiError && error.statusCode === 404) {
			console.log(`\nProject "${projectId}" not found. Creating...`);
			try {
				await createProject(token, projectId);
				console.log(`✓ Created project "${projectId}"`);
				return;
			} catch (createError) {
				if (createError instanceof DeviceSDKApiError) {
					console.error(
						`\n✗ Failed to create project "${projectId}": ${createError.message}`,
					);
					if (createError.responseBody) {
						console.error(JSON.stringify(createError.responseBody, null, 2));
					}
				}
				throw createError;
			}
		}
		throw error;
	}
}

export default async function deploy(
	options: DeployOptions = {},
): Promise<void> {
	try {
		const token = await requireAuth();
		const config = await loadConfig(options.config);
		const configDir = getConfigDir(options.config);
		const buildDir = path.join(configDir, ".devicesdk", "build");

		// Create build directory
		await fs.mkdir(buildDir, { recursive: true });

		// Filter devices if specific device requested
		let devicesToDeploy = Object.entries(config.devices);
		if (options.device) {
			const device = config.devices[options.device];
			if (!device) {
				console.error(
					`✗ Error: Device "${options.device}" not found in config\n`,
				);
				console.error(
					`  Available devices: ${Object.keys(config.devices).join(", ")}`,
				);
				process.exit(EXIT.CONFIG_INVALID);
			}
			devicesToDeploy = [[options.device, device]];
		}

		if (devicesToDeploy.length === 0) {
			console.error("✗ Error: No devices configured\n");
			console.error("  Add devices to your devicesdk.ts configuration file.");
			process.exit(EXIT.CONFIG_INVALID);
		}

		// Build all devices first
		console.log(
			`Building ${devicesToDeploy.length} device${devicesToDeploy.length !== 1 ? "s" : ""}...`,
		);

		const builtDevices: Array<{
			deviceId: string;
			script: string;
			size: number;
			entrypointName?: string;
			haEntities?: unknown[];
		}> = [];

		for (const [deviceId, device] of devicesToDeploy) {
			const mainFile = path.resolve(configDir, device.main);

			// Check if main file exists
			try {
				await fs.access(mainFile);
			} catch {
				console.error(`✗ ${deviceId}: Main file not found: ${device.main}`);
				process.exit(EXIT.BUILD_ERROR);
			}

			try {
				const { size, outfile } = await buildDevice(
					deviceId,
					mainFile,
					buildDir,
					{},
				);
				const script = await fs.readFile(outfile, "utf-8");
				builtDevices.push({
					deviceId,
					script,
					size,
					entrypointName: device.entrypoint,
					haEntities: device.ha?.entities,
				});
				console.log(`✓ Built ${deviceId} (${formatSize(size)})`);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				console.error(`✗ ${deviceId}: Build failed - ${message}`);
				process.exit(EXIT.BUILD_ERROR);
			}
		}

		if (options.dryRun) {
			console.log(
				`\n✓ Dry run complete: ${builtDevices.length} device${builtDevices.length !== 1 ? "s" : ""} would be deployed`,
			);
			return;
		}

		await ensureProjectExists(token, config.projectId);

		// Deploy
		console.log(`\n⬆ Uploading to project "${config.projectId}"...`);

		if (options.device && builtDevices.length === 1) {
			// Single device upload
			const { deviceId, script, entrypointName } = builtDevices[0];
			try {
				const result = await uploadScript(
					token,
					config.projectId,
					deviceId,
					script,
					options.message,
					entrypointName,
				);
				console.log(`\n✓ ${deviceId}  ${result.version_id}  (updated)`);
				if (result.device_rebooted) {
					console.log(`  Device rebooted: ${result.reboot_reason}`);
				} else {
					console.log(`  Device not rebooted: ${result.reboot_reason}`);
				}
				console.log(`\nDeployed 1 device successfully`);
			} catch (error) {
				if (error instanceof DeviceSDKApiError) {
					console.error(`\n✗ ${deviceId}: ${error.message}`);
				} else {
					throw error;
				}
				process.exit(EXIT.DEPLOY_ERROR);
			}
		} else {
			// Batch upload
			const devices: Record<string, { script: string; entrypoint?: string }> =
				{};
			for (const { deviceId, script, entrypointName } of builtDevices) {
				devices[deviceId] = { script };
				if (entrypointName) {
					devices[deviceId].entrypoint = entrypointName;
				}
			}

			try {
				const result = await uploadScriptsBatch(
					token,
					config.projectId,
					devices,
					options.message,
				);

				console.log("");
				for (const version of result.versions) {
					const statusText =
						version.status === "created" ? "(created)" : "(updated)";
					const rebootText = version.device_rebooted
						? "rebooted"
						: `not rebooted: ${version.reboot_reason}`;
					console.log(
						`✓ ${version.device_id.padEnd(20)} ${version.version_id}  ${statusText}  (${rebootText})`,
					);
				}

				console.log(
					`\nDeployed ${result.versions.length} device${result.versions.length !== 1 ? "s" : ""} successfully`,
				);
			} catch (error) {
				if (error instanceof DeviceSDKApiError) {
					console.error(`\n✗ Deploy failed: ${error.message}`);
				} else {
					throw error;
				}
				process.exit(EXIT.DEPLOY_ERROR);
			}
		}

		// Upload Home Assistant entity declarations for any devices that declared them.
		// Done after script deploy so a failed entity upload doesn't block the script.
		const devicesWithEntities = builtDevices.filter(
			(d) => d.haEntities && d.haEntities.length > 0,
		);
		if (devicesWithEntities.length > 0) {
			console.log("\n⬆ Uploading Home Assistant entity declarations...");
			for (const { deviceId, haEntities } of devicesWithEntities) {
				try {
					const result = await upsertDeviceEntities(
						token,
						config.projectId,
						deviceId,
						haEntities!,
					);
					console.log(
						`✓ ${deviceId}: ${result.count} entit${result.count === 1 ? "y" : "ies"}`,
					);
				} catch (error) {
					const msg =
						error instanceof DeviceSDKApiError
							? error.message
							: error instanceof Error
								? error.message
								: "Unknown error";
					console.error(`⚠ ${deviceId}: failed to upload entities — ${msg}`);
				}
			}
		}
	} catch (error) {
		console.error("✗ Error: Deploy failed\n");
		if (error instanceof Error) {
			console.error(`  ${error.message}`);
		}
		process.exit(EXIT.DEPLOY_ERROR);
	}
}
