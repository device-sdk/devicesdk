import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext, tableProjects } from "../../types";

export class UpdateProject extends BaseRoute {
	public schema = {
		tags: ["Projects"],
		summary: "Update a project",
		operationId: "projects-update",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
			}),
			body: contentJson(
				z.object({
					name: z.string().max(100).optional(),
					description: z.string().max(500).optional(),
				}),
			),
		},
		responses: {
			"200": {
				description: "Returns the updated project",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							id: z.string(),
							project_slug: z.string(),
							name: z.string().nullable(),
							description: z.string().nullable(),
							updated_at: z.number(),
						}),
					}),
				),
			},
			"404": {
				description: "Project not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId } = data.params;

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

		const now = Date.now();
		const updateData: Partial<tableProjects> = {
			updated_at: now,
		};

		if (data.body.name !== undefined) {
			updateData.name = data.body.name;
		}
		if (data.body.description !== undefined) {
			updateData.description = data.body.description;
		}

		await qb
			.update({
				tableName: "projects",
				data: updateData,
				where: {
					conditions: ["id = ?1"],
					params: [project.id],
				},
			})
			.execute();

		return c.json({
			success: true,
			result: {
				id: project.id,
				project_slug: project.project_slug,
				name:
					data.body.name !== undefined ? data.body.name || null : project.name,
				description:
					data.body.description !== undefined
						? data.body.description || null
						: project.description,
				updated_at: now,
			},
		});
	}
}
