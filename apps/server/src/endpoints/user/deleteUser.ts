import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { purgeUserData } from "../../foundation/purgeUser";
import type { AppContext } from "../../types";

export class DeleteUser extends BaseRoute {
	public schema = {
		tags: ["User"],
		summary: "Delete the account and all its data immediately",
		operationId: "users-delete",
		responses: {
			"200": {
				description: "Account deleted",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							deleted: z.boolean(),
						}),
					}),
				),
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");

		// Self-hosted: no grace period - purge projects, devices, scripts,
		// tokens, and sessions right away.
		await purgeUserData(c.env, user.id);

		return c.json({
			success: true,
			result: { deleted: true },
		});
	}
}
