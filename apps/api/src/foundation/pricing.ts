// Single source of truth for usage-based pricing used to compute the
// *estimated* spend shown on the dashboard. These figures are derived from
// sampled Analytics Engine data (see foundation/analytics.ts) and are explicitly
// estimates, not an invoice.
//
// ⚠️ PLACEHOLDER RATES — replace with the real platform pricing before this is
// presented as anything other than an internal estimate. The shape is stable;
// only the numbers should change.

export interface UsageTotals {
	messagesIn: number;
	messagesOut: number;
	bytesIn: number;
	bytesOut: number;
	cronFires: number;
	connectedSeconds: number;
}

export const EMPTY_USAGE_TOTALS: UsageTotals = {
	messagesIn: 0,
	messagesOut: 0,
	bytesIn: 0,
	bytesOut: 0,
	cronFires: 0,
	connectedSeconds: 0,
};

/** USD rates. One place to tune; `estimateCostUsd` is the only consumer. */
export const PRICING = {
	/** Per 1,000,000 device messages (inbound + outbound combined). */
	perMillionMessages: 0.4,
	/** Per 1,000,000 cron-driven user-worker invocations (compute). */
	perMillionCronFires: 2.0,
	/** Per GB of WebSocket transfer (bytes in + out). */
	perGbTransfer: 0.05,
	/** Per device-connected-hour. Reserved; free for now. */
	perDeviceConnectedHour: 0.0,
} as const;

const MILLION = 1_000_000;
const GB = 1_000_000_000;
const SECONDS_PER_HOUR = 3600;

/**
 * Estimate the USD cost of a usage bundle. Pure function — same totals always
 * yield the same number, so it is trivially unit-testable and safe to call per
 * device or per time bucket.
 */
export function estimateCostUsd(totals: UsageTotals): number {
	const messages = totals.messagesIn + totals.messagesOut;
	const bytes = totals.bytesIn + totals.bytesOut;
	const cost =
		(messages / MILLION) * PRICING.perMillionMessages +
		(totals.cronFires / MILLION) * PRICING.perMillionCronFires +
		(bytes / GB) * PRICING.perGbTransfer +
		(totals.connectedSeconds / SECONDS_PER_HOUR) *
			PRICING.perDeviceConnectedHour;
	// Round to cents-with-headroom (4 dp) so tiny usage isn't floored to $0 and
	// the dashboard can format as it sees fit.
	return Math.round(cost * 10_000) / 10_000;
}
