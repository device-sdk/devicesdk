import { contentJson } from "chanfana";
import { z } from "zod";
import { invalidateAuthForCurrentRequest } from "../../foundation/authCache";
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

		// Idempotent: if already scheduled, return the existing deadline without resetting it
		if (user.deletion_requested_at) {
			return c.json({
				success: true,
				result: {
					deletion_scheduled_at:
						user.deletion_requested_at + DELETION_GRACE_PERIOD_MS,
				},
			});
		}

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

		// Invalidate the auth cache for the current request's token so the
		// next request (in this colo) returns 403 instead of authenticating
		// from a stale cache. Cross-colo invalidation eats the 60 s TTL — the
		// 7-day grace period dwarfs that, so it's an acceptable trade-off.
		await invalidateAuthForCurrentRequest(c);

		return c.json({
			success: true,
			result: {
				deletion_scheduled_at: now + DELETION_GRACE_PERIOD_MS,
			},
		});
	}
}
