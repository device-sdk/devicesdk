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
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							password: z.string().min(1).max(256),
						}),
					},
				},
			},
		},
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
		const data = await this.getValidatedData<typeof this.schema>();
		const user = c.get("user");

		// Deleting the account is irreversible - require the password so a
		// stolen session alone cannot destroy the account.
		const row = await c
			.get("qb")
			.fetchOne<{ password_hash: string | null }>({
				tableName: "user",
				fields: "password_hash",
				where: { conditions: ["id = ?1"], params: [user.id] },
			})
			.execute();
		const hash = row.results?.password_hash ?? "";
		const valid = await Bun.password
			.verify(data.body.password, hash)
			.catch(() => false);
		if (!valid) {
			return c.json({ success: false, error: "Password is incorrect." }, 401);
		}

		// Self-hosted: no grace period - purge projects, devices, scripts,
		// tokens, and sessions right away.
		await purgeUserData(c.env, user.id);

		return c.json({
			success: true,
			result: { deleted: true },
		});
	}
}
