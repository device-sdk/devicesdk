import { describe, expect, it } from "vitest";
import {
	BILLING_WINDOW,
	buildDeviceSeriesQuery,
	buildProjectBillingQuery,
	buildProjectSeriesQuery,
	parseTotals,
	sumTotals,
	WINDOWS,
} from "../../src/foundation/metricsClient";
import { EMPTY_USAGE_TOTALS } from "../../src/foundation/pricing";

describe("metricsClient query builders", () => {
	it("buildDeviceSeriesQuery filters by index1 and buckets by the window width", () => {
		const sql = buildDeviceSeriesQuery("dev-1", WINDOWS["1h"], 1000);
		expect(sql).toContain("FROM devicesdk_usage");
		expect(sql).toContain("index1 = 'dev-1'");
		expect(sql).toContain(`intDiv(toUInt32(timestamp), 300) * 300 AS ts`);
		expect(sql).toContain("timestamp >= toDateTime(1000)");
		expect(sql).toContain("sum(double1 * _sample_interval) AS messagesIn");
		expect(sql).toContain("GROUP BY ts ORDER BY ts ASC");
	});

	it("buildProjectSeriesQuery groups by device and bucket and filters by blob1", () => {
		const sql = buildProjectSeriesQuery("proj-1", WINDOWS["7d"], 2000);
		expect(sql).toContain("index1 AS deviceId");
		expect(sql).toContain("blob1 = 'proj-1'");
		expect(sql).toContain(`intDiv(toUInt32(timestamp), 21600) * 21600 AS ts`);
		expect(sql).toContain("GROUP BY deviceId, ts ORDER BY ts ASC");
	});

	it("buildProjectBillingQuery uses a daily bucket", () => {
		const sql = buildProjectBillingQuery("proj-1", 3000);
		expect(sql).toContain(
			`intDiv(toUInt32(timestamp), ${BILLING_WINDOW.bucketSeconds}) * ${BILLING_WINDOW.bucketSeconds} AS ts`,
		);
		expect(sql).toContain("blob1 = 'proj-1'");
	});

	it("rejects identifiers that could break out of the SQL string", () => {
		expect(() =>
			buildDeviceSeriesQuery("dev'; DROP TABLE", WINDOWS["1h"], 0),
		).toThrow(/Unsafe identifier/);
		expect(() => buildProjectSeriesQuery("a b", WINDOWS["1h"], 0)).toThrow(
			/Unsafe identifier/,
		);
	});
});

describe("metricsClient parsing", () => {
	it("parseTotals coerces string/undefined numerics to finite numbers", () => {
		expect(
			parseTotals({
				messagesIn: "1500",
				messagesOut: 200,
				bytesIn: undefined,
				cronFires: "not-a-number",
			}),
		).toEqual({
			messagesIn: 1500,
			messagesOut: 200,
			bytesIn: 0,
			bytesOut: 0,
			cronFires: 0,
			connectedSeconds: 0,
		});
	});

	it("sumTotals adds field-by-field over an empty base", () => {
		const summed = sumTotals([
			{ ...EMPTY_USAGE_TOTALS, messagesIn: 10, bytesOut: 5 },
			{ ...EMPTY_USAGE_TOTALS, messagesIn: 7, cronFires: 2 },
		]);
		expect(summed.messagesIn).toBe(17);
		expect(summed.bytesOut).toBe(5);
		expect(summed.cronFires).toBe(2);
	});

	it("sumTotals of nothing is the empty totals", () => {
		expect(sumTotals([])).toEqual(EMPTY_USAGE_TOTALS);
	});
});
