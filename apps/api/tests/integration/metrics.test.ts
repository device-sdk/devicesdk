import { SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_SESSION_TOKEN } from "../setup-test-data";

const auth = { Authorization: `Bearer ${TEST_SESSION_TOKEN}` };
const DEVICE_SLUG = "metrics-test-device";

// Analytics Engine has no SQL-API token in the test environment, so the metrics
// client degrades to empty result sets. These tests cover the endpoint contract
// (auth, validation, ownership, well-formed empty payloads) rather than real
// aggregation, which can only be exercised against a live AE dataset.
describe("metrics endpoints", () => {
	beforeAll(async () => {
		await SELF.fetch("http://localhost/v1/projects/smart-home/devices", {
			method: "POST",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ device_id: DEVICE_SLUG, name: "Metrics Test" }),
		});
	});

	afterAll(async () => {
		await SELF.fetch(
			`http://localhost/v1/projects/smart-home/devices/${DEVICE_SLUG}`,
			{ method: "DELETE", headers: auth },
		);
	});

	describe("GET /v1/projects/:projectId/devices/:deviceId/metrics", () => {
		it("requires authentication", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/smart-home/devices/${DEVICE_SLUG}/metrics`,
			);
			expect(resp.status).toBe(401);
		});

		it("returns a well-formed empty series for a device with no usage", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/smart-home/devices/${DEVICE_SLUG}/metrics?window=1h`,
				{ headers: auth },
			);
			expect(resp.status).toBe(200);
			const json = (await resp.json()) as {
				success: boolean;
				result: {
					window: string;
					bucket_seconds: number;
					series: unknown[];
					totals: { messages_in: number; estimated_cost_usd: number };
				};
			};
			expect(json.success).toBe(true);
			expect(json.result.window).toBe("1h");
			expect(json.result.bucket_seconds).toBe(300);
			expect(json.result.series).toEqual([]);
			expect(json.result.totals.messages_in).toBe(0);
			expect(json.result.totals.estimated_cost_usd).toBe(0);
		});

		it("defaults the window to 1h when omitted", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/smart-home/devices/${DEVICE_SLUG}/metrics`,
				{ headers: auth },
			);
			const json = (await resp.json()) as { result: { window: string } };
			expect(json.result.window).toBe("1h");
		});

		it("rejects an invalid window", async () => {
			const resp = await SELF.fetch(
				`http://localhost/v1/projects/smart-home/devices/${DEVICE_SLUG}/metrics?window=99h`,
				{ headers: auth },
			);
			expect(resp.status).toBe(400);
		});

		it("returns 404 for an unknown device", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/devices/does-not-exist/metrics",
				{ headers: auth },
			);
			expect(resp.status).toBe(404);
		});
	});

	describe("GET /v1/projects/:projectId/metrics", () => {
		it("requires authentication", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/metrics",
			);
			expect(resp.status).toBe(401);
		});

		it("returns per-device entries, totals, and a 30d billing block", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/smart-home/metrics?window=12h",
				{ headers: auth },
			);
			expect(resp.status).toBe(200);
			const json = (await resp.json()) as {
				success: boolean;
				result: {
					window: string;
					devices: Array<{ device_id: string; series: unknown[] }>;
					totals: { estimated_cost_usd: number };
					billing: { window: string; daily: unknown[]; total_usd: number };
				};
			};
			expect(json.success).toBe(true);
			expect(json.result.window).toBe("12h");
			// The device we created is listed with an (empty) series.
			expect(json.result.devices.some((d) => d.device_id === DEVICE_SLUG)).toBe(
				true,
			);
			expect(json.result.totals.estimated_cost_usd).toBe(0);
			expect(json.result.billing.window).toBe("30d");
			expect(json.result.billing.daily).toEqual([]);
			expect(json.result.billing.total_usd).toBe(0);
		});

		it("returns 404 for an unknown project", async () => {
			const resp = await SELF.fetch(
				"http://localhost/v1/projects/no-such-project/metrics",
				{ headers: auth },
			);
			expect(resp.status).toBe(404);
		});
	});
});
