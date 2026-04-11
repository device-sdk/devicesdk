import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import type { AppContext } from "../../types";

export class CompleteOnboarding extends BaseRoute {
	public schema = {
		tags: ["User"],
		summary: "Mark onboarding as completed for the current user",
		operationId: "users-complete-onboarding",
		responses: {
			"200": {
				description: "Onboarding marked as completed",
				...contentJson(
					z.object({
						success: z.boolean(),
					}),
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");

		await c.env.DB.prepare(
			"UPDATE user SET onboarding_completed = 1 WHERE id = ?",
		)
			.bind(user.id)
			.run();

		return c.json({ success: true });
	}
}
