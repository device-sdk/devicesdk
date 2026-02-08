import { z } from "zod";

export type DeviceType = "pico-w" | "pico2-w" | "esp32" | "esp32c61";
const deviceTypeSchema: z.ZodType<DeviceType> = z.enum([
	"pico-w",
	"pico2-w",
	"esp32",
	"esp32c61",
]);

export const DeviceConfigSchema = z
	.object({
		entrypoint: z.string().min(1, "'entrypoint' is required"),
		main: z.string().optional(),
		deviceType: deviceTypeSchema,
		name: z.string().optional(),
		description: z.string().optional(),
		wifi: z.object({
			ssid: z.string().min(1, "wifi.ssid is required"),
			password: z.string().min(1, "wifi.password is required"),
		}),
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
