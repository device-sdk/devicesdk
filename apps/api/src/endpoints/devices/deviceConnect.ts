import * as Sentry from "@sentry/cloudflare";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type {
	AppContext,
	tableDeviceScripts,
	tableDevices,
	tableProjects,
} from "../../types";

export class DeviceConnect extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Connect to a given device via WebSocket",
		operationId: "devices-connect",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
			query: z.object({
				versionId: z.string().min(1).max(36).optional(),
			}),
		},
		responses: {
			"101": {
				description: "Upgrades connection to a WebSocket",
			},
			"400": {
				description: "Bad request - missing required parameters",
			},
			"404": {
				description: "Project or device not found",
			},
			"426": {
				description: "Upgrade required - WebSocket upgrade header expected",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;
		let versionId = data.query.versionId ?? "latest";

		// Validate that the project exists and belongs to the user
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

		// Validate that the device exists (auto-create if it doesn't for backward compatibility)
		const device = await qb
			.fetchOne<tableDevices>({
				tableName: "devices",
				where: {
					conditions: ["project_id = ?1", "device_slug = ?2"],
					params: [project.id, deviceId],
				},
			})
			.execute()
			.then((d) => d.results);

		// Auto-create device if it doesn't exist (for backward compatibility)
		if (!device) {
			return c.json({ success: false, error: "Device not found" }, 404);
		}

		if (versionId === "latest") {
			versionId = device.current_version_id as string;
		}

		// Validate that the device exists (auto-create if it doesn't for backward compatibility)
		const version = await qb
			.fetchOne<tableDeviceScripts>({
				tableName: "device_scripts",
				where: {
					conditions: ["version_id = ?"],
					params: [versionId],
				},
			})
			.execute()
			.then((d) => d.results);

		// Auto-create device if it doesn't exist (for backward compatibility)
		if (!version) {
			return c.json({ success: false, error: "Version not found" }, 404);
		}

		// Update last_connected_at
		await qb
			.update({
				tableName: "devices",
				data: {
					last_connected_at: Date.now(),
				},
				where: {
					conditions: ["id = ?1"],
					params: [device.id],
				},
			})
			.execute();

		// Create a unique DO instance per device
		// Using project.id:device.id (UUIDs) ensures each physical device gets its own DO
		const doName = `${project.id}:${device.id}`;
		const durableObjectId = c.env.DEVICE.idFromName(doName);
		const durableObjectStub = c.env.DEVICE.get(durableObjectId);

		// Build the URL with query params for the DO to read
		const url = new URL(c.req.url);
		url.pathname = "/websocket";
		url.searchParams.set("userId", user.id);
		url.searchParams.set("projectId", project.id);
		url.searchParams.set("deviceId", device.id);
		// Slugs are used as the R2 key prefix by uploadScript/getScript/etc.;
		// the DO needs them to locate the script in R2.
		url.searchParams.set("projectSlug", projectId);
		url.searchParams.set("deviceSlug", deviceId);
		url.searchParams.set("versionId", versionId);
		url.searchParams.set("entrypointName", version.entrypoint);
		url.searchParams.set("plan", user.plan ?? "free");

		// Create a new request with the modified URL
		const doRequest = new Request(url.toString(), {
			method: c.req.method,
			headers: c.req.raw.headers,
		});

		try {
			return await durableObjectStub.fetch(doRequest);
		} catch (err) {
			Sentry.captureException(err);
			return c.json(
				{ success: false, error: "Device service temporarily unavailable" },
				503,
			);
		}
	}
}
