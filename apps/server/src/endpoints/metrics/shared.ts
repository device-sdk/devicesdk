// Shared wire shapes + serialization for the metrics endpoints. Keeps the
// snake_case response contract in one place so the device and project
// endpoints can't drift apart. (Cost estimation was a cloud-billing concept
// and is gone in the self-hosted server.)

import { z } from "zod";
import type { UsageTotals } from "../../foundation/usageMetrics";

export const usageTotalsSchema = z.object({
	messages_in: z.number(),
	messages_out: z.number(),
	bytes_in: z.number(),
	bytes_out: z.number(),
	cron_fires: z.number(),
	connected_seconds: z.number(),
});

export const usageBucketSchema = usageTotalsSchema.extend({
	ts: z.number(),
});

/** Map internal UsageTotals → snake_case wire shape. */
export function usageToWire(totals: UsageTotals) {
	return {
		messages_in: totals.messagesIn,
		messages_out: totals.messagesOut,
		bytes_in: totals.bytesIn,
		bytes_out: totals.bytesOut,
		cron_fires: totals.cronFires,
		connected_seconds: totals.connectedSeconds,
	};
}
