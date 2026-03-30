/**
 * Shared constants for inter-device RPC.
 * Used by classProxy.ts, devicesBridge.ts, and tests.
 */

export const BLOCKED_METHODS = [
	"onMessage",
	"onDeviceConnect",
	"onDeviceDisconnect",
	"onAlarm",
	"onCron",
	"getCrons",
	"constructor",
	"env",
	"ctx",
] as const;

export const MAX_CALL_DEPTH = 3;
