import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { getDeviceStub } from "../../foundation/durableObjectStub";
import { logger } from "../../foundation/logger";
import { resolveProjectAndDevice } from "../../foundation/projectDeviceResolve";
import type { AppContext } from "../../types";

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
	"get_temperature",
	"watchdog_configure",
	"watchdog_feed",
	"spi_configure",
	"spi_transfer",
	"spi_write",
	"spi_read",
	"uart_configure",
	"uart_write",
	"uart_read",
	"pio_ws2812_configure",
	"pio_ws2812_update",
] as const;

const commandBodySchema = z.object({
	type: z.enum(VALID_COMMAND_TYPES),
	payload: z
		.object({})
		.passthrough()
		.optional()
		.default({})
		.refine((p) => JSON.stringify(p).length <= 4096, {
			message: "Command payload too large (max 4KB)",
		}),
});

export class SendDeviceCommand extends BaseRoute {
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
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;
		const { type, payload } = data.body;

		const resolved = await resolveProjectAndDevice(c, projectId, deviceId);
		if (resolved instanceof Response) return resolved;
		const { project, device } = resolved;

		// Dispatch the command to the Durable Object via RPC
		const stub = getDeviceStub(c.env, project.id, device.id);

		let doResult: { status: number; body: string };
		try {
			doResult = await stub.handleCommand({ type, payload });
		} catch (err) {
			logger.error(err as Error, "Unhandled error");
			return c.json(
				{ success: false, error: "Device service temporarily unavailable" },
				503,
			);
		}

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

		if (doResult.status !== 200) {
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
