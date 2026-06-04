export const DEVICE_SINGLETON_NAME = "DEVICE";
export const SESSION_COOKIE_NAME = "devicesdk-session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
export const DELETION_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Device logging limits
export const VALID_LOG_LEVELS = [
	"log",
	"info",
	"warn",
	"error",
	"debug",
] as const;
export type LogLevel = (typeof VALID_LOG_LEVELS)[number];
export const LOG_MESSAGE_MAX_LENGTH = 10_000;
export const LOG_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const LOG_MAX_STORED = 1_000;
// Log cleanup runs at most every N writes AND every M ms — whichever is later.
// Each run scans up to LOG_MAX_STORED rows for the overflow DELETE, so we want
// it infrequent. The previous N=10 burned DO rows-read on chatty scripts.
export const LOG_CLEANUP_INTERVAL = 100;
export const LOG_CLEANUP_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export const JS_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Canonical platform limit lives in @devicesdk/core; re-exported here so API
// code keeps sourcing constants from one place.
export { MAX_SCRIPT_SIZE_BYTES } from "@devicesdk/core";

// --- Tier-based usage limits ---

export type UserPlan = "free" | "paid";

export const TIER_LIMITS = {
	free: {
		maxProjects: 3,
		maxDevicesPerProject: 5,
		maxScriptVersionsPerDevice: 5,
		maxApiTokens: 5,
		maxMessagesPerDevicePerDay: 500,
		maxEnvVarsPerProject: 50,
		apiRateLimit: { maxRequests: 60, windowMs: 60_000 },
	},
	paid: {
		maxProjects: 30,
		maxDevicesPerProject: 50,
		maxScriptVersionsPerDevice: 50,
		maxApiTokens: 50,
		maxMessagesPerDevicePerDay: 50_000,
		maxEnvVarsPerProject: 200,
		apiRateLimit: { maxRequests: 120, windowMs: 60_000 },
	},
} as const satisfies Record<UserPlan, TierLimits>;

export interface TierLimits {
	maxProjects: number;
	maxDevicesPerProject: number;
	maxScriptVersionsPerDevice: number;
	maxApiTokens: number;
	maxMessagesPerDevicePerDay: number;
	maxEnvVarsPerProject: number;
	apiRateLimit: { maxRequests: number; windowMs: number };
}

/** WebSocket close code for rate limiting (application-specific range 4000-4999) */
export const WS_CLOSE_RATE_LIMITED = 4029;

/**
 * WebSocket close code used when a new device connection supersedes a stale one
 * on the same Durable Object (application-specific range 4000-4999). A device
 * that lost power can leave a half-open "device" socket attached until the
 * runtime reaps it; the connect handler closes any such socket with this code
 * before accepting the replacement so only one device session is ever live.
 */
export const WS_CLOSE_REPLACED = 4001;

/** DO storage keys for message counting */
export const MESSAGE_COUNT_KEY = "__internal:message_count";
export const MESSAGE_COUNT_DATE_KEY = "__internal:message_count_date";
