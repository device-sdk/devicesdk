// Env var key validation: uppercase letters, digits, underscores, max 64 chars, must start with a letter
export const ENV_VAR_KEY_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/;

// ---- Branded ID types ----
// These are nominal aliases of `string`. They cost nothing at runtime, but
// catch the most common LLM mistake - passing a `projectId` where a `deviceId`
// is expected - at compile time.
//
// The constructors (`asProjectId`, `asDeviceId`, ...) validate at the boundary
// where untyped strings enter your code (CLI args, API request params, etc.)
// and brand them. From that point on the type system tracks identity.

declare const __brand: unique symbol;
type Brand<B extends string> = { readonly [__brand]: B };

/** A DeviceSDK project ID. Use {@link asProjectId} to construct one from a string. */
export type ProjectId = string & Brand<"ProjectId">;
/** A DeviceSDK device ID, scoped to a project. Use {@link asDeviceId}. */
export type DeviceId = string & Brand<"DeviceId">;
/** A DeviceSDK script version ID. Use {@link asScriptId}. */
export type ScriptId = string & Brand<"ScriptId">;
/** A DeviceSDK API or CLI token. Use {@link asTokenId}. */
export type TokenId = string & Brand<"TokenId">;

/** Project ID validator: 3..64 chars, lowercase alnum + hyphen, must start with a letter. */
export const PROJECT_ID_REGEX = /^[a-z][a-z0-9-]{2,63}$/;
/** Device ID validator: same shape as project IDs. */
export const DEVICE_ID_REGEX = /^[a-z][a-z0-9-]{2,63}$/;

function brand<B extends string>(
	value: string,
	check: ((s: string) => boolean) | undefined,
	label: string,
): string & Brand<B> {
	if (check && !check(value)) {
		throw new Error(
			`Invalid ${label}: "${value}". Expected ${label === "ProjectId" ? "lowercase letters, digits, hyphens; 3..64 chars; must start with a letter" : "the documented format"}.`,
		);
	}
	return value as string & Brand<B>;
}

/** Validate and brand a string as a {@link ProjectId}. Throws on invalid input. */
export const asProjectId = (s: string): ProjectId =>
	brand<"ProjectId">(
		s,
		(v) => PROJECT_ID_REGEX.test(v),
		"ProjectId",
	) as ProjectId;
/** Validate and brand a string as a {@link DeviceId}. Throws on invalid input. */
export const asDeviceId = (s: string): DeviceId =>
	brand<"DeviceId">(s, (v) => DEVICE_ID_REGEX.test(v), "DeviceId") as DeviceId;
/** Brand a string as a {@link ScriptId}. No format check (server-assigned UUIDs). */
export const asScriptId = (s: string): ScriptId =>
	brand<"ScriptId">(s, undefined, "ScriptId") as ScriptId;
/** Brand a string as a {@link TokenId}. No format check (opaque). */
export const asTokenId = (s: string): TokenId =>
	brand<"TokenId">(s, undefined, "TokenId") as TokenId;

/**
 * Virtual GPIO that maps to the onboard LED on every supported board.
 *
 * - Pico W: WiFi-chip LED (not a real GPIO)
 * - Pico 2W: GPIO 25
 * - ESP32-C3 DevKitM-1: WS2812 on GPIO 8
 * - ESP32-C61 DevKitC-1: WS2812 on GPIO 5
 *
 * Use this constant in `setGpioState` to keep your code portable across
 * targets - the firmware translates it to the right physical pin.
 *
 * @example
 * await this.env.DEVICE.setGpioState(OnboardLED, "high");
 */
export const OnboardLED = 99 as const;
