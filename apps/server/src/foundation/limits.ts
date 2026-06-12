import type { AppContext } from "../types";

/**
 * Checks whether creating a new resource would exceed the configured limit.
 * Self-hosted servers use generous fixed defaults (see consts.ts) — these
 * exist to catch runaway scripts, not to meter users.
 * Returns a 403 JSON Response if the limit is reached, or null if within limits.
 */
export function enforceResourceLimit(
	c: AppContext,
	currentCount: number,
	maxCount: number,
	resourceName: string,
): Response | null {
	if (currentCount >= maxCount) {
		return c.json(
			{
				success: false,
				error: `Limit reached (${currentCount}/${maxCount} ${resourceName}).`,
			},
			403,
		);
	}
	return null;
}
