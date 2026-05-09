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
import { emitJsonError, emitJsonSuccess, isJsonMode } from "../output.js";
import { getConfigDir, loadConfig } from "../utils.js";
import { buildDevice, formatSize } from "./build.js";

interface DeployOptions {
	device?: string;
	message?: string;
	dryRun?: boolean;
	config?: string;
	json?: boolean;
}

const DEPLOY_DOCS = "https://devicesdk.com/docs/cli/deploy/";

async function ensureProjectExists(
	token: string,
	projectId: string,
	json: boolean,
): Promise<void> {
	try {
		await getProject(token, projectId);
	} catch (error) {
		if (error instanceof DeviceSDKApiError && error.statusCode === 404) {
			if (!json) console.log(`\nProject "${projectId}" not found. Creating...`);
			try {
				await createProject(token, projectId);
				if (!json) console.log(`✓ Created project "${projectId}"`);
				return;
			} catch (createError) {
				if (createError instanceof DeviceSDKApiError && !json) {
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

interface JsonDeployVersion {
	deviceId: string;
	versionId: string;
	status: "created" | "updated";
	deviceRebooted: boolean;
	rebootReason: string;
}

export default async function deploy(
	options: DeployOptions = {},
): Promise<void> {
	const json = isJsonMode(options);
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
				const msg = `Device "${options.device}" not found in config. Available: ${Object.keys(config.devices).join(", ")}`;
				if (json)
					emitJsonError(msg, {
						code: "device_not_in_config",
						docs: DEPLOY_DOCS,
					});
				else {
					console.error(
						`✗ Error: Device "${options.device}" not found in config\n`,
					);
					console.error(
						`  Available devices: ${Object.keys(config.devices).join(", ")}`,
					);
				}
				process.exit(EXIT.CONFIG_INVALID);
			}
			devicesToDeploy = [[options.device, device]];
		}

		if (devicesToDeploy.length === 0) {
			const msg =
				"No devices configured. Add devices to your devicesdk.ts configuration file.";
			if (json)
				emitJsonError(msg, {
					code: "no_devices_configured",
					docs: DEPLOY_DOCS,
				});
			else {
				console.error("✗ Error: No devices configured\n");
				console.error("  Add devices to your devicesdk.ts configuration file.");
			}
			process.exit(EXIT.CONFIG_INVALID);
		}

		// Build all devices first
		if (!json) {
			console.log(
				`Building ${devicesToDeploy.length} device${devicesToDeploy.length !== 1 ? "s" : ""}...`,
			);
		}

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
				const msg = `${deviceId}: Main file not found: ${device.main}`;
				if (json)
					emitJsonError(msg, { code: "main_file_missing", docs: DEPLOY_DOCS });
				else console.error(`✗ ${msg}`);
				process.exit(EXIT.BUILD_ERROR);
			}

			try {
				const { size, outfile } = await buildDevice(
					deviceId,
					mainFile,
					device.className,
					buildDir,
					{},
				);
				const script = await fs.readFile(outfile, "utf-8");
				builtDevices.push({
					deviceId,
					script,
					size,
					entrypointName: device.className,
					haEntities: device.ha?.entities,
				});
				if (!json) console.log(`✓ Built ${deviceId} (${formatSize(size)})`);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown error";
				if (json)
					emitJsonError(`${deviceId}: Build failed - ${message}`, {
						code: "build_failed",
						docs: DEPLOY_DOCS,
					});
				else console.error(`✗ ${deviceId}: Build failed - ${message}`);
				process.exit(EXIT.BUILD_ERROR);
			}
		}

		if (options.dryRun) {
			if (json) {
				emitJsonSuccess({
					dryRun: true,
					projectId: config.projectId,
					deviceCount: builtDevices.length,
					devices: builtDevices.map((d) => ({
						deviceId: d.deviceId,
						size: d.size,
					})),
				});
				return;
			}
			console.log(
				`\n✓ Dry run complete: ${builtDevices.length} device${builtDevices.length !== 1 ? "s" : ""} would be deployed`,
			);
			return;
		}

		await ensureProjectExists(token, config.projectId, json);

		// Deploy
		if (!json) console.log(`\n⬆ Uploading to project "${config.projectId}"...`);

		const deployedVersions: JsonDeployVersion[] = [];

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
				deployedVersions.push({
					deviceId,
					versionId: result.version_id,
					status: "updated",
					deviceRebooted: result.device_rebooted,
					rebootReason: result.reboot_reason,
				});
				if (!json) {
					console.log(`\n✓ ${deviceId}  ${result.version_id}  (updated)`);
					if (result.device_rebooted) {
						console.log(`  Device rebooted: ${result.reboot_reason}`);
					} else {
						console.log(`  Device not rebooted: ${result.reboot_reason}`);
					}
					console.log(`\nDeployed 1 device successfully`);
				}
			} catch (error) {
				if (error instanceof DeviceSDKApiError) {
					if (json)
						emitJsonError(`${deviceId}: ${error.message}`, {
							code: error.code ?? "deploy_failed",
							docs: error.docs ?? DEPLOY_DOCS,
						});
					else console.error(`\n✗ ${deviceId}: ${error.message}`);
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

				if (!json) console.log("");
				for (const version of result.versions) {
					deployedVersions.push({
						deviceId: version.device_id,
						versionId: version.version_id,
						status: version.status === "created" ? "created" : "updated",
						deviceRebooted: version.device_rebooted,
						rebootReason: version.reboot_reason,
					});
					if (!json) {
						const statusText =
							version.status === "created" ? "(created)" : "(updated)";
						const rebootText = version.device_rebooted
							? "rebooted"
							: `not rebooted: ${version.reboot_reason}`;
						console.log(
							`✓ ${version.device_id.padEnd(20)} ${version.version_id}  ${statusText}  (${rebootText})`,
						);
					}
				}

				if (!json) {
					console.log(
						`\nDeployed ${result.versions.length} device${result.versions.length !== 1 ? "s" : ""} successfully`,
					);
				}
			} catch (error) {
				if (error instanceof DeviceSDKApiError) {
					if (json)
						emitJsonError(`Deploy failed: ${error.message}`, {
							code: error.code ?? "deploy_failed",
							docs: error.docs ?? DEPLOY_DOCS,
						});
					else console.error(`\n✗ Deploy failed: ${error.message}`);
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
		const entityResults: Array<{
			deviceId: string;
			count?: number;
			error?: string;
		}> = [];
		if (devicesWithEntities.length > 0) {
			if (!json)
				console.log("\n⬆ Uploading Home Assistant entity declarations...");
			for (const { deviceId, haEntities } of devicesWithEntities) {
				try {
					const result = await upsertDeviceEntities(
						token,
						config.projectId,
						deviceId,
						haEntities!,
					);
					entityResults.push({ deviceId, count: result.count });
					if (!json) {
						console.log(
							`✓ ${deviceId}: ${result.count} entit${result.count === 1 ? "y" : "ies"}`,
						);
					}
				} catch (error) {
					const msg =
						error instanceof DeviceSDKApiError
							? error.message
							: error instanceof Error
								? error.message
								: "Unknown error";
					entityResults.push({ deviceId, error: msg });
					if (!json)
						console.error(`⚠ ${deviceId}: failed to upload entities — ${msg}`);
				}
			}
		}

		if (json) {
			emitJsonSuccess({
				projectId: config.projectId,
				versions: deployedVersions,
				...(entityResults.length > 0 ? { entities: entityResults } : {}),
			});
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Deploy failed";
		if (json)
			emitJsonError(msg, {
				code: error instanceof DeviceSDKApiError ? error.code : undefined,
				docs:
					error instanceof DeviceSDKApiError && error.docs
						? error.docs
						: DEPLOY_DOCS,
			});
		else {
			console.error("✗ Error: Deploy failed\n");
			console.error(`  ${msg}`);
		}
		process.exit(EXIT.DEPLOY_ERROR);
	}
}
