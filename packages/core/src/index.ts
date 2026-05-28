// Public API barrel. The actual definitions live in focused modules:
// - commands.ts: Command<>, all *Command types, DeviceCommand union
// - responses.ts: All response types, DeviceResponse union, CommandResponseTypeMap
// - runtime.ts: KVInterface, EnvVarsInterface, UserWorkerEnv, DeviceSenderInterface, Content
// - identity.ts: ENV_VAR_KEY_REGEX, branded ID types, asXxx, OnboardLED
// - ha.ts: Home Assistant entity types
// - entrypoint.ts: DeviceEntrypoint base class + deprecated RemoteDevice/GetEnv

export * from "./commands.js";
export * from "./entrypoint.js";
export * from "./ha.js";
export * from "./identity.js";
export * from "./responses.js";
export * from "./runtime.js";

/**
 * Maximum uploaded device-script size, in bytes (1 MiB). Canonical platform
 * limit shared by the API (upload validation) and the CLI (pre-deploy check).
 */
export const MAX_SCRIPT_SIZE_BYTES = 1024 * 1024;
