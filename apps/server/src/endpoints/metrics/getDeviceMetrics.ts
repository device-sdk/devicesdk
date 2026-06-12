import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import { resolveProjectAndDevice } from "../../foundation/projectDeviceResolve";
import {
	fetchDeviceSeries,
	type MetricsWindow,
	sumTotals,
	WINDOWS,
} from "../../foundation/usageMetrics";
import type { AppContext } from "../../types";
import { usageBucketSchema, usageTotalsSchema, usageToWire } from "./shared";

export class GetDeviceMetrics extends BaseRoute {
	public schema = {
		tags: ["Metrics"],
		summary: "Get time-bucketed usage metrics for a single device",
		operationId: "devices-get-metrics",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
				deviceId: z.string().min(1).max(36),
			}),
			query: z.object({
				window: z.enum(["1h", "12h", "7d"]).default("1h"),
			}),
		},
		responses: {
			"200": {
				description: "Usage metrics over the requested window",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							window: z.string(),
							bucket_seconds: z.number(),
							series: z.array(usageBucketSchema),
							totals: usageTotalsSchema,
						}),
					}),
				),
			},
			"404": {
				description: "Project or device not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId, deviceId } = data.params;
		const window = data.query.window as MetricsWindow;

		const resolved = await resolveProjectAndDevice(c, projectId, deviceId);
		if (resolved instanceof Response) return resolved;
		const { device } = resolved;

		// Usage is recorded under the device's UUID, not its slug.
		const buckets = fetchDeviceSeries(c.env.qb.db, device.id, window);

		return c.json({
			success: true,
			result: {
				window,
				bucket_seconds: WINDOWS[window].bucketSeconds,
				series: buckets.map((b) => ({ ts: b.ts, ...usageToWire(b) })),
				totals: usageToWire(sumTotals(buckets)),
			},
		});
	}
}
