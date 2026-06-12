import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import {
	fetchProjectSeries,
	type MetricsWindow,
	sumTotals,
	type UsageBucket,
	WINDOWS,
} from "../../foundation/usageMetrics";
import type { AppContext, tableDevices, tableProjects } from "../../types";
import { usageBucketSchema, usageTotalsSchema, usageToWire } from "./shared";

export class GetProjectMetrics extends BaseRoute {
	public schema = {
		tags: ["Metrics"],
		summary: "Get aggregated usage metrics for every device in a project",
		operationId: "projects-get-metrics",
		request: {
			params: z.object({
				projectId: z.string().min(1).max(36),
			}),
			query: z.object({
				window: z.enum(["1h", "12h", "7d"]).default("12h"),
			}),
		},
		responses: {
			"200": {
				description: "Per-device usage series and project totals",
				...contentJson(
					z.object({
						success: z.boolean(),
						result: z.object({
							window: z.string(),
							bucket_seconds: z.number(),
							devices: z.array(
								z.object({
									device_id: z.string(),
									name: z.string().nullable(),
									series: z.array(usageBucketSchema),
									totals: usageTotalsSchema,
								}),
							),
							totals: usageTotalsSchema,
						}),
					}),
				),
			},
			"404": {
				description: "Project not found",
			},
		},
	};

	public async handle(c: AppContext) {
		const user = c.get("user");
		const qb = c.get("qb");
		const data = await this.getValidatedData<typeof this.schema>();
		const { projectId } = data.params;
		const window = data.query.window as MetricsWindow;

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

		const devicesResult = await qb
			.fetchAll<tableDevices>({
				tableName: "devices",
				where: {
					conditions: ["project_id = ?1"],
					params: [project.id],
				},
			})
			.execute();
		const devices = devicesResult.results || [];

		const allBuckets = fetchProjectSeries(c.env.qb.db, project.id, window);
		const byDevice = new Map<string, UsageBucket[]>();
		for (const bucket of allBuckets) {
			const list = byDevice.get(bucket.deviceId) ?? [];
			list.push(bucket);
			byDevice.set(bucket.deviceId, list);
		}

		const deviceEntries = devices.map((device) => {
			const series = byDevice.get(device.id) ?? [];
			return {
				device_id: device.device_slug,
				name: device.name ?? null,
				series: series.map((b) => ({ ts: b.ts, ...usageToWire(b) })),
				totals: usageToWire(sumTotals(series)),
			};
		});

		return c.json({
			success: true,
			result: {
				window,
				bucket_seconds: WINDOWS[window].bucketSeconds,
				devices: deviceEntries,
				totals: usageToWire(sumTotals(allBuckets)),
			},
		});
	}
}
