import { ENV_VAR_KEY_REGEX } from "@devicesdk/core";
import { contentJson } from "chanfana";
import { BaseRoute } from "../../foundation/baseRoute";
import { z } from "zod";
import type { AppContext, tableProjects } from "../../types";

const MAX_VARS_PER_PROJECT = 50;
const MAX_VALUE_BYTES = 4096;

export class SetEnvVars extends BaseRoute {
	public schema = {
		tags: ["Env Vars"],
		summary: "Set one or more environment variables for a project",
		operationId: "env-vars-set",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
			}),
			body: contentJson(
				z.object({
					// Keys and values validated manually in handle() for proper 400 responses
					vars: z.record(z.string(), z.string()),
				}),
			),
		},
		responses: {
			"200": {
				description: "Returns count of vars set",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							count: z.number(),
						}),
					}),
				),
			},
			"400": {
				description: "Invalid key format or value too large",
			},
			"404": {
				description: "Project not found",
			},
			"422": {
				description: "Too many env vars",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId } = data.params;
		const { vars } = data.body;

		// Validate key format and value size
		for (const [key, value] of Object.entries(vars)) {
			if (!ENV_VAR_KEY_REGEX.test(key)) {
				return c.json(
					{
						success: false,
						error: `Invalid key "${key}". Keys must be uppercase letters, digits, and underscores, starting with a letter (max 64 chars).`,
					},
					400,
				);
			}
			if (new TextEncoder().encode(value).length > MAX_VALUE_BYTES) {
				return c.json(
					{
						success: false,
						error: `Value for "${key}" exceeds the ${MAX_VALUE_BYTES}-byte limit.`,
					},
					400,
				);
			}
		}

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

		const entries = Object.entries(vars);
		if (entries.length === 0) {
			return c.json({ success: true, result: { count: 0 } });
		}

		// Check total count won't exceed limit.
		// Note: D1 doesn't support cross-statement transactions, so there is a race window
		// under concurrent requests — two requests at 49 vars can both pass the count check
		// and both insert, leaving the project at 51 vars. Accepted tradeoff: the cap may
		// be exceeded by at most (trulyNewCount - 1) vars under concurrent load.
		const existingCount = await c.env.DB.prepare(
			"SELECT COUNT(*) as count FROM project_env_vars WHERE project_id = ?",
		)
			.bind(project.id)
			.first<{ count: number }>();

		const currentCount = existingCount?.count ?? 0;
		const newKeys = new Set(entries.map(([k]) => k));

		// Count how many are truly new (not updates to existing keys)
		const existingKeys = await c.env.DB.prepare(
			"SELECT key FROM project_env_vars WHERE project_id = ?",
		)
			.bind(project.id)
			.all<{ key: string }>();

		const existingKeySet = new Set(
			(existingKeys.results ?? []).map((r) => r.key),
		);
		const trulyNewCount = [...newKeys].filter(
			(k) => !existingKeySet.has(k),
		).length;

		if (currentCount + trulyNewCount > MAX_VARS_PER_PROJECT) {
			return c.json(
				{
					success: false,
					error: `Cannot exceed ${MAX_VARS_PER_PROJECT} env vars per project`,
				},
				422,
			);
		}

		const now = Date.now();

		// Upsert all key-value pairs in a single batch round-trip
		const statements = entries.map(([key, value]) =>
			c.env.DB.prepare(
				`INSERT INTO project_env_vars (id, project_id, key, value, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			).bind(crypto.randomUUID(), project.id, key, value, now, now),
		);
		await c.env.DB.batch(statements);

		return c.json({
			success: true,
			result: { count: entries.length },
		});
	}
}
