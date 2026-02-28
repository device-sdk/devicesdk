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
export const LOG_CLEANUP_INTERVAL = 10; // Clean up every N writes
