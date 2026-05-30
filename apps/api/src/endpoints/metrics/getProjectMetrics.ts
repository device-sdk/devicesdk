import { contentJson } from "chanfana";
import { z } from "zod";
import { BaseRoute } from "../../foundation/baseRoute";
import {
	fetchProjectBilling,
	fetchProjectSeries,
	type MetricsWindow,
	sumTotals,
	type UsageBucket,
	WINDOWS,
} from "../../foundation/metricsClient";
import { estimateCostUsd } from "../../foundation/pricing";
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
				description:
					"Per-device usage series, project totals, and 30-day estimated spend",
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
							billing: z.object({
								window: z.string(),
								daily: z.array(
									z.object({
										ts: z.number(),
										estimated_cost_usd: z.number(),
									}),
								),
								total_usd: z.number(),
							}),
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
				where: { conditions: ["project_id = ?1"], params: [project.id] },
			})
			.execute();
		const devices = devicesResult.results || [];

		// Per-device usage over the window + 30-day daily billing, in parallel.
		const [seriesRows, billingBuckets] = await Promise.all([
			fetchProjectSeries(c.env, project.id, window),
			fetchProjectBilling(c.env, project.id),
		]);

		// Group window buckets by device UUID.
		const bucketsByDevice = new Map<string, UsageBucket[]>();
		for (const row of seriesRows) {
			const list = bucketsByDevice.get(row.deviceId) ?? [];
			list.push(row);
			bucketsByDevice.set(row.deviceId, list);
		}

		// One entry per project device (UUID → slug/name), so the chart legend is
		// stable even for devices with no usage in the window.
		const deviceMetrics = devices.map((d) => {
			const buckets = bucketsByDevice.get(d.id) ?? [];
			return {
				device_id: d.device_slug,
				name: d.name || null,
				series: buckets.map((b) => ({ ts: b.ts, ...usageToWire(b) })),
				totals: usageToWire(sumTotals(buckets)),
			};
		});

		const projectTotals = sumTotals(seriesRows);

		// Daily spend is linear in usage, so the 30-day total equals the cost of
		// the summed totals — no need to re-add per-day rounding.
		const billing = {
			window: "30d",
			daily: billingBuckets.map((b) => ({
				ts: b.ts,
				estimated_cost_usd: estimateCostUsd(b),
			})),
			total_usd: estimateCostUsd(sumTotals(billingBuckets)),
		};

		return c.json({
			success: true,
			result: {
				window,
				bucket_seconds: WINDOWS[window].bucketSeconds,
				devices: deviceMetrics,
				totals: usageToWire(projectTotals),
				billing,
			},
		});
	}
}
