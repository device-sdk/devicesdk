import * as Sentry from "@sentry/cloudflare";
import { getCookie } from "hono/cookie";
import type { AppContext, tableUser } from "../types";
import { SESSION_COOKIE_NAME } from "./consts";
import { TieredCache } from "./tieredCache";
import { hashToken } from "./tokenHash";

/**
 * Cached auth subset.
 *
 * `suspended_at` and `deletion_requested_at` are included so the cache hit
 * path can run the same `checkSuspension` / `checkDeletionPending` gates as
 * the D1 path. Without them we'd let a freshly-suspended user continue to
 * authenticate for up to the TTL.
 */
export type CachedAuthUser = Pick<
	tableUser,
	| "id"
	| "name"
	| "email"
	| "picture"
	| "verified_email"
	| "plan"
	| "suspended_at"
	| "deletion_requested_at"
	| "onboarding_completed"
	| "created_at"
>;

/**
 * 60 s — short enough that logout/suspension propagates within a minute,
 * long enough that ~95% of authenticated requests skip D1 entirely under
 * normal usage. Logout in the same colo is immediate via `invalidateAuthToken`;
 * cross-colo logout takes up to one TTL.
 */
const TTL_SEC = 60;

function getCache(c: AppContext): TieredCache | null {
	if (!c.env.CACHE) return null;
	return new TieredCache(c.env.CACHE, "auth", c.executionCtx);
}

/**
 * Returns the cached user for a Bearer/session token, or null if the token
 * isn't in cache. The caller is still responsible for running suspension /
 * deletion gates on the returned user — those signals are part of the cached
 * shape but cache hits skip the D1 query that would otherwise fetch them.
 *
 * Cache failures are Sentry-captured and return null (fail open → cold path
 * runs as before).
 */
export async function getCachedUser(
	c: AppContext,
	token: string,
): Promise<CachedAuthUser | null> {
	const cache = getCache(c);
	if (!cache) return null;
	try {
		const tokenHash = await hashToken(token);
		return await cache.get<CachedAuthUser>(tokenHash);
	} catch (err) {
		Sentry.captureException(err);
		return null;
	}
}

/**
 * Populate the auth cache after a successful D1 lookup. Fire-and-forget — KV
 * minimum TTL is 60 s, which the TieredCache enforces. Failures are
 * Sentry-captured but do not break the request flow.
 */
export async function setCachedUser(
	c: AppContext,
	token: string,
	user: CachedAuthUser,
): Promise<void> {
	const cache = getCache(c);
	if (!cache) return;
	try {
		const tokenHash = await hashToken(token);
		await cache.set<CachedAuthUser>(tokenHash, user, { ttlSec: TTL_SEC });
	} catch (err) {
		Sentry.captureException(err);
	}
}

/**
 * Drop the cache entry for a token. Called from `handleLogout` so the colo
 * that processes logout sees the change immediately. Other colos will eat the
 * remaining TTL (≤60 s) before they re-read from KV (which is also evicted).
 */
export async function invalidateAuthToken(
	c: AppContext,
	token: string,
): Promise<void> {
	const cache = getCache(c);
	if (!cache) return;
	try {
		const tokenHash = await hashToken(token);
		await cache.delete(tokenHash);
	} catch (err) {
		Sentry.captureException(err);
	}
}

/**
 * Convenience for endpoints that mutate the authenticated user's row (e.g.
 * complete onboarding, request deletion). Derives the token from the current
 * request the same way `authenticateUser` does — Bearer header first, then
 * session cookie — and clears the cache entry for it.
 *
 * Cross-colo staleness still applies: in colos that previously cached this
 * user, the next request still serves stale data for up to one TTL (60 s).
 * For onboarding flips that's harmless (the wizard won't reappear elsewhere
 * within the same minute). For sensitive mutations (suspension / deletion)
 * the trade-off is documented in the auth cache JSDoc.
 */
export async function invalidateAuthForCurrentRequest(
	c: AppContext,
): Promise<void> {
	const authHeader = c.req.header("Authorization");
	if (authHeader && authHeader.toLowerCase().startsWith("bearer")) {
		const token = authHeader.substring(6).trim();
		if (token) await invalidateAuthToken(c, token);
		return;
	}
	const cookieToken = getCookie(c, SESSION_COOKIE_NAME);
	if (cookieToken) await invalidateAuthToken(c, cookieToken);
}
