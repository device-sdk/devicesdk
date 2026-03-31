import type { AppContext } from "../types";
import type { UserPlan } from "./consts";

/**
 * Checks whether creating a new resource would exceed the user's tier limit.
 * Returns a 403 JSON Response if the limit is reached, or null if within limits.
 */
export function enforceResourceLimit(
	c: AppContext,
	currentCount: number,
	maxCount: number,
	resourceName: string,
): Response | null {
	if (currentCount >= maxCount) {
		const plan: UserPlan = c.get("user").plan ?? "free";
		const upgradeHint =
			plan === "free"
				? " Upgrade to increase your limit or contact support@devicesdk.com."
				: " Contact support@devicesdk.com to discuss higher limits.";
		return c.json(
			{
				success: false,
				error: `${plan === "free" ? "Free" : "Paid"} tier limit reached (${currentCount}/${maxCount} ${resourceName}).${upgradeHint}`,
			},
			403,
		);
	}
	return null;
}
