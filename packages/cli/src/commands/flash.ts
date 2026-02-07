import fs from "fs/promises";
import os from "os";
import path from "path";
import {
	createDevice,
	createProject,
	DeviceSDKApiError,
	downloadDeviceFirmware,
	downloadESP32Firmware,
	getDevice,
	getProject,
	isEsp32DeviceType,
} from "../api.js";
import { requireAuth } from "../credentials.js";
import { checkEsptoolInstalled, flashESP32 } from "../flash/esp32.js";
import { flashPico } from "../flash/pico.js";
import { getConfigDir, loadConfig } from "../utils.js";

interface FlashOptions {
	config?: string;
	timeout?: number;
	host?: string;
	port?: string;
	baud?: number;
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

async function ensureDeviceExists(
	token: string,
	projectId: string,
	deviceId: string,
	name?: string,
	description?: string,
): Promise<void> {
	try {
		await getDevice(token, projectId, deviceId);
	} catch (error) {
		if (error instanceof DeviceSDKApiError && error.statusCode === 404) {
			console.log(`\nDevice "${deviceId}" not found. Creating...`);
			try {
				await createDevice(token, projectId, deviceId, name, description);
				console.log(`✓ Created device "${deviceId}"`);
				return;
			} catch (createError) {
				if (createError instanceof DeviceSDKApiError) {
					console.error(
						`\n✗ Failed to create device "${deviceId}": ${createError.message}`,
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

export default async function flash(
	deviceId: string,
	options: FlashOptions = {},
): Promise<void> {
	if (!deviceId) {
		console.error("✗ Error: Device ID is required");
		process.exit(5);
	}

	try {
		const token = await requireAuth();
		const config = await loadConfig(options.config);
		const configDir = getConfigDir(options.config);

		const deviceConfig = config.devices[deviceId];
		if (!deviceConfig) {
			console.error(`✗ Error: Device "${deviceId}" not found in config\n`);
			console.error(
				`  Available devices: ${Object.keys(config.devices).join(", ")}`,
			);
			process.exit(5);
		}

		await ensureProjectExists(token, config.projectId);
		await ensureDeviceExists(
			token,
			config.projectId,
			deviceId,
			deviceConfig.name,
			deviceConfig.description,
		);

		const deviceType = deviceConfig.deviceType;

		if (isEsp32DeviceType(deviceType)) {
			// Check esptool is installed before downloading firmware
			const hasEsptool = await checkEsptoolInstalled();
			if (!hasEsptool) {
				console.error("✗ Error: esptool.py is not installed or not in PATH");
				console.error("\n  Install it with: pip install esptool");
				console.error(
					"  Or see: https://docs.espressif.com/projects/esptool/en/latest/",
				);
				process.exit(6);
			}

			console.log(`\n⬇ Downloading firmware for ${deviceId}...`);
			const firmwareZip = await downloadESP32Firmware(
				token,
				config.projectId,
				deviceId,
				deviceConfig.wifi,
				deviceType,
				{ host: options.host },
			);

			const firmwareDir = path.join(
				configDir,
				".devicesdk",
				"firmware",
				deviceId,
			);

			if (!options.port) {
				console.log("\nConnect your ESP32 device via USB...");
			}

			const result = await flashESP32({
				firmwareZip,
				outputDir: firmwareDir,
				port: options.port,
				baud: options.baud,
				timeoutMs: options.timeout ?? 60_000,
			});

			console.log(`\n✓ Flashed ${deviceId} via ${result.port}`);
			console.log(
				"\nLED status sequence after reboot: 1 blink = booted, then 2 blinks = Wi-Fi connected, then 3 blinks = cloud connected.",
			);
		} else {
			// Pico device type
			console.log(`\n⬇ Downloading firmware for ${deviceId}...`);
			const firmware = await downloadDeviceFirmware(
				token,
				config.projectId,
				deviceId,
				deviceConfig.wifi,
				deviceType,
				{ host: options.host },
			);

			const firmwareDir = path.join(configDir, ".devicesdk", "firmware");
			await fs.mkdir(firmwareDir, { recursive: true });
			const firmwarePath = path.join(firmwareDir, `${deviceId}.uf2`);
			await fs.writeFile(firmwarePath, firmware);

			console.log(
				'\nConnect your Raspberry Pi Pico in BOOTSEL mode (should appear as volume "RPI-RP2" or "RP2350")...',
			);
			const result = await flashPico({
				firmwarePath,
				timeoutMs: options.timeout ?? 120_000,
			});
			console.log(`\n✓ Flashed ${deviceId} to ${result.mountpoint}`);
			console.log(
				"\nLED status sequence after reboot: 1 blink = booted, then 2 blinks = Wi-Fi connected, then 3 blinks = cloud connected.",
			);
		}
	} catch (error) {
		console.error("✗ Error: Flash failed\n");
		if (error instanceof Error) {
			console.error(`  ${error.message}`);
		}
		process.exit(6);
	}
}
