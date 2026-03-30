import { ApiException, contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext, tableDevices, tableProjects } from "../../types";

const deviceSlugRegex = /^[a-z][a-z0-9-]{0,35}$/;

export class CreateDevice extends BaseRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Register a new device in a project",
		operationId: "devices-create",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
			}),
			body: contentJson(
				z.object({
					device_id: z.string().min(1).max(36),
					name: z.string().max(100).optional(),
					description: z.string().max(500).optional(),
				}),
			),
		},
		responses: {
			"201": {
				description: "Returns the created device",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							id: z.string(),
							device_id: z.string(),
							name: z.string().nullable(),
							description: z.string().nullable(),
							created_at: z.number(),
						}),
					}),
				),
			},
			"400": {
				description: "Bad request - invalid device_id format",
			},
			"404": {
				description: "Project not found",
			},
			"409": {
				description: "Device already exists",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId } = data.params;

		const deviceSlug = data.body.device_id;

		if (!deviceSlugRegex.test(deviceSlug)) {
			return c.json(
				{
					success: false,
					error:
						"Invalid device_id format. Must be lowercase alphanumeric with hyphens, starting with a letter.",
				},
				400,
			);
		}

		// Find the project
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

		// Check if device already exists
		const existingDevice = await qb
			.fetchOne<tableDevices>({
				tableName: "devices",
				where: {
					conditions: ["project_id = ?1", "device_slug = ?2"],
					params: [project.id, deviceSlug],
				},
			})
			.execute()
			.then((d) => d.results);

		if (existingDevice) {
			return c.json({ success: false, error: "Device already exists" }, 409);
		}

		const now = Date.now();
		const newDevice = await qb
			.insert<tableDevices>({
				tableName: "devices",
				data: {
					id: crypto.randomUUID(),
					project_id: project.id,
					device_slug: deviceSlug,
					name: data.body.name || null,
					description: data.body.description || null,
					created_at: now,
					updated_at: now,
				},
				returning: "*",
			})
			.execute();

		if (!newDevice.results) {
			throw new ApiException("Failed to create device");
		}

		return c.json(
			{
				success: true,
				result: {
					id: newDevice.results.id,
					device_id: newDevice.results.device_slug,
					name: newDevice.results.name,
					description: newDevice.results.description,
					created_at: newDevice.results.created_at,
				},
			},
			201,
		);
	}
}
