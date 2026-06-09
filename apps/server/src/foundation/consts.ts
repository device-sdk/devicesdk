export const DEVICE_SINGLETON_NAME = "DEVICE";
export const SESSION_COOKIE_NAME = "devicesdk-session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

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

// --- Self-hosted resource limits ---
// Generous fixed bounds; they protect the server from runaway scripts and
// unbounded growth, not meter users (there are no plans/tiers).
export const RESOURCE_LIMITS = {
	maxProjects: 100,
	maxDevicesPerProject: 100,
	maxScriptVersionsPerDevice: 20,
	maxApiTokens: 100,
	maxEnvVarsPerProject: 200,
} as const;

/**
 * WebSocket close code used when a new device connection supersedes a stale
 * one for the same device (application-specific range 4000-4999). A device
 * that lost power can leave a half-open "device" socket attached until the
 * runtime reaps it; the connect handler closes any such socket with this code
 * before accepting the replacement so only one device session is ever live.
 */
export const WS_CLOSE_REPLACED = 4001;
