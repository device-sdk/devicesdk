import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { TIER_LIMITS } from "../../foundation/consts";
import type { AppContext } from "../../types";

export class UserDetails extends BaseRoute {
	public schema = {
		tags: ["User"],
		summary: "Get details on the user profile",
		operationId: "users-me",
		responses: {
			"200": {
				description: "Returns the user details",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							id: z.uuid(),
							name: z.string().optional(),
							picture: z.string().optional(),
							email: z.string(),
							verified_email: z.number().int(),
							created_at: z.number().int(),
							plan: z.enum(["free", "paid"]),
							limits: z.object({
								max_projects: z.number().int(),
								max_devices_per_project: z.number().int(),
								max_script_versions_per_device: z.number().int(),
								max_api_tokens: z.number().int(),
								max_messages_per_device_per_day: z.number().int(),
								max_env_vars_per_project: z.number().int(),
							}),
							usage: z.object({
								projects: z.number().int(),
								api_tokens: z.number().int(),
							}),
						}),
					}),
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const plan = user.plan ?? "free";
		const limits = TIER_LIMITS[plan];

		const [projectCount, tokenCount] = await Promise.all([
			c.env.DB.prepare(
				"SELECT COUNT(*) as count FROM projects WHERE user_id = ?",
			)
				.bind(user.id)
				.first<{ count: number }>(),
			c.env.DB.prepare(
				"SELECT COUNT(*) as count FROM tokens WHERE user_id = ? AND (managed = 0 OR managed IS NULL)",
			)
				.bind(user.id)
				.first<{ count: number }>(),
		]);

		return {
			success: true,
			result: {
				id: user.id,
				name: user.name,
				picture: user.picture,
				email: user.email,
				verified_email: user.verified_email,
				created_at: user.created_at,
				plan,
				limits: {
					max_projects: limits.maxProjects,
					max_devices_per_project: limits.maxDevicesPerProject,
					max_script_versions_per_device: limits.maxScriptVersionsPerDevice,
					max_api_tokens: limits.maxApiTokens,
					max_messages_per_device_per_day: limits.maxMessagesPerDevicePerDay,
					max_env_vars_per_project: limits.maxEnvVarsPerProject,
				},
				usage: {
					projects: projectCount?.count ?? 0,
					api_tokens: tokenCount?.count ?? 0,
				},
			},
		};
	}
}
