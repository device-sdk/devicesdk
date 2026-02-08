import { ApiException, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext, tableProjects } from "../../types";

const OLD_TOKEN = "e343ecb8036442e093a47718463c1716";
const OLD_SSID = "8d477eda147344f8b9b8d3e3bef7505b";
const OLD_PASS =
	"ebc8394548904aa583916609049d5ea527021de49780437a98915189223dcf8";
const OLD_HOST = "3ed66c2c3ed1474382278f70ba01dc4c";
const OLD_PROJECT_ID = "288f2d2493094af68ab37a96ef73a118";
const OLD_DEVICE_ID = "d09f91a7729141eb8911d7a0f1e1595f";

const TOKEN_LENGTH = OLD_TOKEN.length;
const SSID_LENGTH = OLD_SSID.length; // 32 bytes
const PASS_LENGTH = OLD_PASS.length; // 63 bytes
const HOST_LENGTH = OLD_HOST.length; // 32 bytes
const PROJECT_LENGTH = OLD_PROJECT_ID.length; // 32 bytes
const DEVICE_LENGTH = OLD_DEVICE_ID.length; // 32 bytes
const encoder = new TextEncoder();

export class DownloadFirmware extends OpenAPIRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Download device firmware",
		operationId: "devices-firmware-download",
		request: {
			params: z.object({
				projectId: z.string(),
				deviceId: z.string(),
			}),
			body: {
				content: {
					"application/json": {
						schema: z.object({
							ssid: z.string().max(32).optional(),
							pass: z.string().max(63).optional(),
							host: z.string().optional().default("api.devicesdk.com"),
							device_type: z.enum(["pico-w", "pico2-w", "esp32", "esp32c61"]),
						}),
					},
				},
			},
		},
		responses: {
			200: {
				description: "Firmware file",
				// content: {
				// 	"application/octet-stream": {
				// 		schema: {
				// 			type: "string",
				// 			format: "binary",
				// 		},
				// 	},
				// },
			},
			404: {
				description: "Project not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;
		const { ssid = "", pass = "", host } = data.body;

		// Validate project exists and belongs to user
		const project = await qb
			.fetchOne<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["user_id = ?1", "project_slug = ?2"],
					params: [user.id, projectId],
				},
			})
			.execute()
			.then((p) => p.results);

		if (!project) {
			return c.json({ success: false, error: "Project not found" }, 404);
		}

		// Validate device exists and belongs to the project
		const device = await qb
			.fetchOne<{ id: string }>({
				tableName: "devices",
				where: {
					conditions: ["device_slug = ?1", "project_id = ?2"],
					params: [deviceId, project.id],
				},
			})
			.execute()
			.then((p) => p.results);

		if (!device) {
			return c.json({ success: false, error: "Device not found" }, 404);
		}

		// Look for existing token with description "{device id} authentication token" and managed true
		const tokenDescription = `${deviceId} authentication token`;
		const existingToken = await qb
			.fetchOne<{ token: string }>({
				tableName: "tokens",
				where: {
					conditions: ["user_id = ?1", "description = ?2", "managed = ?3"],
					params: [user.id, tokenDescription, 1],
				},
			})
			.execute()
			.then((p) => p.results);

		let newKey: string;
		if (existingToken) {
			newKey = existingToken.token;
		} else {
			// Create a new token
			const tokenId = crypto.randomUUID();
			newKey = crypto.randomUUID().replace(/-/g, "");
			const createdAt = Date.now();

			await qb
				.insert({
					tableName: "tokens",
					data: {
						id: tokenId,
						user_id: user.id,
						token: newKey,
						created_at: createdAt,
						description: tokenDescription,
						managed: 1,
					},
				})
				.execute();
		}

		const deviceType = data.body.device_type;

		// Determine firmware key and filename based on device type
		let firmwareKey: string;
		let filename: string;
		if (deviceType === "esp32" || deviceType === "esp32c61") {
			firmwareKey = `${deviceType}-client.bin`;
			filename = `${deviceType}-client.bin`;
		} else {
			firmwareKey = `devicesdk-${deviceType}-client.uf2`;
			filename = "devicesdk-client.uf2";
		}

		const object = await c.env.FIRMWARES.get(firmwareKey);
		if (!object) return c.text("Firmware not found", 404);

		const arrayBuffer = await object.arrayBuffer();
		const bytes = new Uint8Array(arrayBuffer);

		try {
			const tokenBytes = padAsciiToLength(newKey, TOKEN_LENGTH, "Token");
			const ssidBytes = padAsciiToLength(ssid, SSID_LENGTH, "SSID");
			const passBytes = padAsciiToLength(pass, PASS_LENGTH, "Password");
			const hostBytes = padAsciiToLength(host, HOST_LENGTH, "Hostname");
			const projectBytes = padAsciiToLength(
				projectId,
				PROJECT_LENGTH,
				"Project",
			);
			const deviceBytes = padAsciiToLength(deviceId, DEVICE_LENGTH, "Device");

			replacePossiblySplitAscii(bytes, OLD_TOKEN, tokenBytes, "Token");
			replacePossiblySplitAscii(bytes, OLD_SSID, ssidBytes, "SSID");
			replacePossiblySplitAscii(bytes, OLD_PASS, passBytes, "Password");
			replacePossiblySplitAscii(bytes, OLD_HOST, hostBytes, "Hostname");
			replacePossiblySplitAscii(bytes, OLD_PROJECT_ID, projectBytes, "Project");
			replacePossiblySplitAscii(bytes, OLD_DEVICE_ID, deviceBytes, "Device");
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Firmware patch failed";
			return c.json({ success: false, error: message }, 400);
		}

		return new Response(bytes, {
			headers: {
				"Content-Type": "application/octet-stream",
				"Content-Disposition": `attachment; filename="${filename}"`,
			},
		});
	}
}

function padAsciiToLength(value: string, length: number, label: string) {
	const encoded = encoder.encode(value);
	if (encoded.length > length) {
		throw new ApiException(`${label} too long (max ${length} bytes)`);
	}
	const out = new Uint8Array(length);
	out.set(encoded.slice(0, length));
	return out;
}

function replacePossiblySplitAscii(
	bytes: Uint8Array,
	oldStr: string,
	newBytes: Uint8Array,
	label: string,
) {
	const oldBytes = encoder.encode(oldStr);
	if (oldBytes.length !== newBytes.length) {
		throw new ApiException(`${label} length mismatch`);
	}

	const contiguousIdx = findSequence(bytes, oldBytes);
	if (contiguousIdx !== -1) {
		bytes.set(newBytes, contiguousIdx);
		return;
	}

	for (let split = 1; split < oldBytes.length; split++) {
		const part1 = oldBytes.slice(0, split);
		const part2 = oldBytes.slice(split);
		const idx1 = findSequence(bytes, part1);
		if (idx1 === -1) continue;
		const idx2 = findSequence(bytes, part2, idx1 + part1.length);
		if (idx2 === -1) continue;
		bytes.set(newBytes.slice(0, split), idx1);
		bytes.set(newBytes.slice(split), idx2);
		return;
	}

	throw new ApiException(`${label} placeholder not found in firmware`);
}

function findSequence(
	haystack: Uint8Array,
	needle: Uint8Array,
	start = 0,
): number {
	if (!needle.length) return -1;
	for (let i = start; i <= haystack.length - needle.length; i++) {
		let match = true;
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i + j] !== needle[j]) {
				match = false;
				break;
			}
		}
		if (match) return i;
	}
	return -1;
}
