import type { HaEntityDeclaration } from "@devicesdk/core";
import { z } from "zod";

// Re-export the canonical type from core so CLI consumers (e.g. downstream
// configs) can continue to `import { HaEntityDeclaration } from "@devicesdk/cli"`.
export type { HaEntityDeclaration } from "@devicesdk/core";

export type DeviceType =
	| "pico-w"
	| "pico2-w"
	| "esp32"
	| "esp32c61"
	| "esp32c3";
const deviceTypeSchema: z.ZodType<DeviceType> = z.enum([
	"pico-w",
	"pico2-w",
	"esp32",
	"esp32c61",
	"esp32c3",
]);

// Zod schema must stay in the CLI (core has no runtime deps). The type assertion
// below ensures this schema shape matches `HaEntityDeclaration` from core — if
// the two drift, `z.ZodType<HaEntityDeclaration>` will fail to typecheck.
const HaEntityDeclarationSchema: z.ZodType<HaEntityDeclaration> = z.object({
	entity_id: z
		.string()
		.min(1)
		.max(64)
		.regex(
			/^[a-z][a-z0-9_]*$/,
			"entity_id must be lowercase letters, digits, and underscores, starting with a letter",
		),
	type: z.enum(["binary_sensor", "sensor", "switch", "light", "number"]),
	name: z.string().min(1).max(128),
	device_class: z.string().max(64).optional(),
	unit: z.string().max(32).optional(),
	source: z.enum([
		"gpio_state_changed",
		"pin_state_update",
		"temperature_result",
		"user",
	]),
	pin: z.number().int().min(0).max(255).optional(),
	state_map: z
		.object({
			high: z.string().max(32),
			low: z.string().max(32),
		})
		.optional(),
	light_type: z.enum(["pwm", "ws2812"]).optional(),
	pwm_frequency: z.number().int().positive().optional(),
	num_leds: z.number().int().positive().max(1024).optional(),
});

export const DeviceConfigSchema = z
	.object({
		entrypoint: z
			.string()
			.min(1, "'entrypoint' is required")
			.regex(
				/^[A-Za-z_$][A-Za-z0-9_$]*$/,
				"'entrypoint' must be a valid TypeScript class name (letters, digits, _, $)",
			),
		main: z.string().optional(),
		deviceType: deviceTypeSchema,
		name: z.string().optional(),
		description: z.string().optional(),
		wifi: z.object({
			ssid: z.string().min(1, "wifi.ssid is required"),
			password: z.string().min(1, "wifi.password is required"),
		}),
		ha: z
			.object({
				entities: z.array(HaEntityDeclarationSchema),
			})
			.optional(),
	})
	.transform((data) => {
		// Ensure main is always populated for downstream consumers
		return {
			...data,
			main: data.main ?? data.entrypoint,
		} as {
			main: string;
			entrypoint: string;
			deviceType: DeviceType;
			name?: string;
			description?: string;
			wifi: { ssid: string; password: string };
			ha?: { entities: HaEntityDeclaration[] };
		};
	});

export const DeviceSDKConfigSchema = z.object({
	projectId: z
		.string()
		.min(1)
		.max(36)
		.regex(/^[a-z][a-z0-9-]{0,35}$/),
	devices: z.record(z.string(), DeviceConfigSchema),
});

export type DeviceSDKConfig = z.infer<typeof DeviceSDKConfigSchema>;
export type DeviceConfig = Omit<
	z.infer<typeof DeviceConfigSchema>,
	"deviceType"
> & { deviceType: DeviceType };

export function defineConfig(config: DeviceSDKConfig): DeviceSDKConfig {
	return config;
}
