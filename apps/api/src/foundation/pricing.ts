// Single source of truth for the per-unit rates that compute the *estimated*
// spend shown on the dashboard. Figures are derived from sampled Analytics
// Engine data (see foundation/analytics.ts) and are explicitly estimates, not
// an invoice.
//
// Pricing model (see /pricing.md and the customer-facing pricing page,
// apps/website/layouts/pricing/pricing.html): **only WebSocket messages are
// metered** — inbound + outbound combined. Connections, uptime, cron-driven
// invocations, transfer bytes, storage, logs, metrics, and dashboard access are
// all included at no cost, so every rate below except messages is 0. The other
// usage dimensions are still recorded and displayed; they just don't bill.
//
// ⚠️ The per-message rate is a PLACEHOLDER. Public Pro pricing is "contact
// sales", so this is the internal estimate basis until a real number is set.
// Only the numbers should change; the shape is stable.

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
	/**
	 * Per 1,000,000 device messages (inbound + outbound combined). The only
	 * metered dimension. PLACEHOLDER — Pro pricing is "contact sales".
	 */
	perMillionMessages: 0.4,
	/** Cron-driven invocations are included at no cost. */
	perMillionCronFires: 0.0,
	/** WebSocket transfer is not metered (only the message count is). */
	perGbTransfer: 0.0,
	/** Connections and uptime are included at no cost. */
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
