import { contentJson } from "chanfana";
import { BaseRoute } from "../../foundation/baseRoute";
import { z } from "zod";
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
						}),
					}),
				),
			},
		},
	};

	public async handle(c: AppContext) {
		return {
			success: true,
			result: c.get("user"),
		};
	}
}
