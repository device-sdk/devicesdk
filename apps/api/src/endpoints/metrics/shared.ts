// Shared wire shapes + serialization for the metrics endpoints. Keeps the
// snake_case response contract in one place so the device and project endpoints
// can't drift apart.

import { z } from "zod";
import { estimateCostUsd, type UsageTotals } from "../../foundation/pricing";

export const usageTotalsSchema = z.object({
	messages_in: z.number(),
	messages_out: z.number(),
	bytes_in: z.number(),
	bytes_out: z.number(),
	cron_fires: z.number(),
	connected_seconds: z.number(),
	estimated_cost_usd: z.number(),
});

export const usageBucketSchema = usageTotalsSchema.extend({
	ts: z.number(),
});

/** Map internal UsageTotals → snake_case wire shape with its estimated cost. */
export function usageToWire(totals: UsageTotals) {
	return {
		messages_in: totals.messagesIn,
		messages_out: totals.messagesOut,
		bytes_in: totals.bytesIn,
		bytes_out: totals.bytesOut,
		cron_fires: totals.cronFires,
		connected_seconds: totals.connectedSeconds,
		estimated_cost_usd: estimateCostUsd(totals),
	};
}
