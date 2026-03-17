import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { AppContext, tableDevices, tableProjects } from "../../types";

const VALID_COMMAND_TYPES = [
	"set_gpio_state",
	"get_pin_state",
	"set_pwm_state",
	"set_pin_config",
	"i2c_scan",
	"i2c_read",
	"i2c_write",
	"i2c_configure",
	"i2c_batch_write",
	"display_update",
	"configure_gpio_input_monitoring",
	"reboot",
] as const;

const commandBodySchema = z.object({
	type: z.string().min(1),
	payload: z.object({}).passthrough().optional().default({}),
});

export class SendDeviceCommand extends OpenAPIRoute {
	public schema = {
		tags: ["Devices"],
		summary: "Send a hardware command to a connected device",
		operationId: "devices-send-command",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
			body: {
				content: {
					"application/json": {
						schema: commandBodySchema,
					},
				},
			},
		},
		responses: {
			"200": {
				description: "Returns the device response to the command",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							id: z.string(),
							type: z.string(),
							payload: z.object({}).passthrough(),
						}),
					}),
				),
			},
			"400": {
				description: "Invalid command type",
			},
			"404": {
				description: "Project or device not found",
			},
			"503": {
				description: "Device is not connected",
			},
			"504": {
				description: "Command timed out — no response from device",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;
		const { type, payload } = data.body;

		// Validate command type against the whitelist
		if (!(VALID_COMMAND_TYPES as readonly string[]).includes(type)) {
			return c.json(
				{
					success: false,
					error: `Invalid command type: "${type}". Must be one of: ${VALID_COMMAND_TYPES.join(", ")}`,
				},
				400,
			);
		}

		// Find the project owned by this user
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

		// Find the device within that project
		const device = await qb
			.fetchOne<tableDevices>({
				tableName: "devices",
				where: {
					conditions: ["project_id = ?1", "device_slug = ?2"],
					params: [project.id, deviceId],
				},
			})
			.execute()
			.then((d) => d.results);

		if (!device) {
			return c.json({ success: false, error: "Device not found" }, 404);
		}

		// Dispatch the command to the Durable Object via RPC
		const doName = `${project.id}:${device.id}`;
		const durableObjectId = c.env.DEVICE.idFromName(doName);
		const stub = c.env.DEVICE.get(durableObjectId) as unknown as {
			handleCommand(command: {
				type: string;
				payload: Record<string, unknown>;
			}): Promise<{ status: number; body: string }>;
		};

		const doResult = await stub.handleCommand({ type, payload });

		if (doResult.status === 503) {
			return c.json({ success: false, error: "Device is not connected" }, 503);
		}

		if (doResult.status === 504) {
			return c.json(
				{
					success: false,
					error: "Command timed out — device did not respond",
				},
				504,
			);
		}

		if (doResult.status === 500) {
			return c.json({ success: false, error: doResult.body }, 500);
		}

		let deviceResponse: {
			id: string;
			type: string;
			payload: Record<string, unknown>;
		};
		try {
			deviceResponse = JSON.parse(doResult.body) as {
				id: string;
				type: string;
				payload: Record<string, unknown>;
			};
		} catch {
			return c.json(
				{ success: false, error: "Invalid response from device" },
				500,
			);
		}

		return c.json({
			success: true,
			result: deviceResponse,
		});
	}
}
