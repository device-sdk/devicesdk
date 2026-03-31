import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { DELETION_GRACE_PERIOD_MS } from "../../foundation/consts";
import type { AppContext } from "../../types";

export class DeleteUser extends BaseRoute {
	public schema = {
		tags: ["User"],
		summary: "Request account deletion with 7-day grace period",
		operationId: "users-delete",
		responses: {
			"200": {
				description: "Account deletion scheduled",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							deletion_scheduled_at: z.number().int(),
						}),
					}),
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const now = Date.now();

		// Set deletion_requested_at on the user row
		await c.env.DB.prepare(
			"UPDATE user SET deletion_requested_at = ? WHERE id = ?",
		)
			.bind(now, user.id)
			.run();

		// Delete all sessions for the user to immediately revoke access
		await c.env.DB.prepare("DELETE FROM user_sessions WHERE user_id = ?")
			.bind(user.id)
			.run();

		return c.json({
			success: true,
			result: {
				deletion_scheduled_at: now + DELETION_GRACE_PERIOD_MS,
			},
		});
	}
}
