import { describe, expect, it } from "vitest";
import {
	EMPTY_USAGE_TOTALS,
	estimateCostUsd,
	PRICING,
	type UsageTotals,
} from "../../src/foundation/pricing";

describe("estimateCostUsd", () => {
	it("returns 0 for empty usage", () => {
		expect(estimateCostUsd(EMPTY_USAGE_TOTALS)).toBe(0);
	});

	it("charges messages (in + out) at the per-million rate", () => {
		const totals: UsageTotals = {
			...EMPTY_USAGE_TOTALS,
			messagesIn: 600_000,
			messagesOut: 400_000, // 1,000,000 total → exactly one unit
		};
		expect(estimateCostUsd(totals)).toBeCloseTo(PRICING.perMillionMessages, 5);
	});

	it("charges cron fires and transfer bytes additively", () => {
		const totals: UsageTotals = {
			...EMPTY_USAGE_TOTALS,
			cronFires: 1_000_000, // one unit of cron cost
			bytesIn: 500_000_000,
			bytesOut: 500_000_000, // 1 GB total → one unit of transfer cost
		};
		expect(estimateCostUsd(totals)).toBeCloseTo(
			PRICING.perMillionCronFires + PRICING.perGbTransfer,
			5,
		);
	});

	it("is linear: cost of a sum equals the sum of costs", () => {
		const a: UsageTotals = {
			...EMPTY_USAGE_TOTALS,
			messagesIn: 123_456,
			bytesOut: 7_890_123,
		};
		const b: UsageTotals = {
			...EMPTY_USAGE_TOTALS,
			messagesOut: 654_321,
			cronFires: 42,
		};
		const combined: UsageTotals = {
			messagesIn: a.messagesIn + b.messagesIn,
			messagesOut: a.messagesOut + b.messagesOut,
			bytesIn: a.bytesIn + b.bytesIn,
			bytesOut: a.bytesOut + b.bytesOut,
			cronFires: a.cronFires + b.cronFires,
			connectedSeconds: a.connectedSeconds + b.connectedSeconds,
		};
		expect(estimateCostUsd(combined)).toBeCloseTo(
			estimateCostUsd(a) + estimateCostUsd(b),
			4,
		);
	});
});
