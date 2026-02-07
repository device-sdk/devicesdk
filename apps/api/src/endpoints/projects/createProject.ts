import { ApiException, contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext, tableProjects } from "../../types";

const projectSlugRegex = /^[a-z][a-z0-9-]{0,35}$/;

export class CreateProject extends OpenAPIRoute {
	public schema = {
		tags: ["Projects"],
		summary: "Create a new project",
		operationId: "projects-create",
		request: {
			body: contentJson(
				z.object({
					project_slug: z
						.string()
						.min(1)
						.max(36)
						.regex(
							projectSlugRegex,
							"Must be lowercase alphanumeric with hyphens, starting with a letter",
						),
					name: z.string().max(100).optional(),
					description: z.string().max(500).optional(),
				}),
			),
		},
		responses: {
			"201": {
				description: "Returns the created project",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							id: z.string(),
							project_slug: z.string(),
							name: z.string().nullable(),
							description: z.string().nullable(),
							created_at: z.number(),
						}),
					}),
				),
			},
			"400": {
				description: "Bad request - invalid project_slug format",
			},
			"409": {
				description: "Project already exists",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const body: { project_slug: string; name?: string; description?: string } =
			data.body;

		const projectSlug = body.project_slug;

		// Check if project already exists
		const existingProject = await qb
			.fetchOne<tableProjects>({
				tableName: "projects",
				where: {
					conditions: ["user_id = ?1", "project_slug = ?2"],
					params: [user.id, projectSlug],
				},
			})
			.execute()
			.then((p) => p.results);

		if (existingProject) {
			return c.json({ success: false, error: "Project already exists" }, 409);
		}

		const now = Date.now();
		const newProject = await qb
			.insert<tableProjects>({
				tableName: "projects",
				data: {
					id: crypto.randomUUID(),
					user_id: user.id,
					project_slug: projectSlug,
					name: body.name || null,
					description: body.description || null,
					created_at: now,
					updated_at: now,
				},
				returning: "*",
			})
			.execute();

		if (!newProject.results) {
			throw new ApiException("Failed to create project");
		}

		return c.json(
			{
				success: true,
				result: {
					id: newProject.results.id,
					project_slug: newProject.results.project_slug,
					name: newProject.results.name || null,
					description: newProject.results.description || null,
					created_at: newProject.results.created_at,
				},
			},
			201,
		);
	}
}
