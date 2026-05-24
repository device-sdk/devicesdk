import type { DeviceResponse } from "./responses.js";
import type { Content, UserWorkerEnv } from "./runtime.js";

// Backward-compat type aliases — deprecated, use UserWorkerEnv instead

// Lifecycle methods and internal properties excluded from the remote interface
type LifecycleMethods =
	| "onDeviceConnect"
	| "onDeviceDisconnect"
	| "onMessage"
	| "onAlarm"
	| "onCron";
type InternalProps = "env" | "ctx";

/** @deprecated Use UserWorkerEnv instead */
export type RemoteDevice<T> = {
	[K in keyof T as K extends LifecycleMethods | InternalProps
		? never
		: T[K] extends (...args: infer _A) => infer _R
			? K
			: never]: T[K] extends (...args: infer A) => infer R
		? (...args: A) => Promise<Awaited<R>>
		: never;
};

/** @deprecated Use UserWorkerEnv instead */
type RemoteDevices<T> = {
	[K in keyof T]: T[K] extends object ? RemoteDevice<T[K]> : never;
};

/** @deprecated Use UserWorkerEnv instead */
export type GetEnv<ProjectDevices = {}> = UserWorkerEnv<ProjectDevices>;

/**
 * Base class for a DeviceSDK device script. Extend it and export a named class
 * matching the `className` in your `devicesdk.ts`. The runtime calls your
 * lifecycle hooks when the device connects, sends events, or a cron fires.
 *
 * Public methods you define on the subclass (other than the lifecycle hooks)
 * are callable from other devices in the same project as RPC via
 * `this.env.DEVICES["other-slug"].method()`.
 *
 * Your script runs in a sandboxed serverless runtime — **not on the
 * microcontroller and not in Node.js**. Avoid `node:*` imports, filesystem
 * access, and long-running loops; the runtime budgets CPU per event.
 *
 * @example
 * import { DeviceEntrypoint, type DeviceResponse } from "@devicesdk/core";
 *
 * export class Thermostat extends DeviceEntrypoint {
 *   crons = { read: "0 8 * * *" }; // daily at 08:00 UTC
 *
 *   async onCron() {
 *     await this.env.DEVICE.getTemperature();
 *   }
 *
 *   async onMessage(message: DeviceResponse) {
 *     if (message.type === "temperature_result") {
 *       await this.env.DEVICE.kv.put("last_temp", message.payload.celsius);
 *     }
 *   }
 * }
 *
 * @see https://devicesdk.com/docs/concepts/entrypoints/
 */
export class DeviceEntrypoint<Env = UserWorkerEnv> {
	ctx: Content;
	env: Env;

	/**
	 * Named cron schedules for this device script.
	 *
	 * Keys are arbitrary schedule names; values are standard 5-field cron expressions
	 * (minute hour dom month dow, all in UTC). When a cron fires, `onCron` is called
	 * with the matching name.
	 *
	 * Example: `"0 8 * * *"` runs daily at 08:00 UTC; `"0 * * * *"` runs every hour.
	 */
	crons?: Record<string, string>;

	constructor(ctx: Content, env: Env) {
		this.ctx = ctx;
		this.env = env;
	}

	/**
	 * Called when the physical device opens its WebSocket connection to the runtime.
	 * Use this to push initial configuration (set pin modes, configure I2C buses,
	 * subscribe to inputs). Avoid heavy work — the runtime budgets CPU per event.
	 *
	 * Override on your subclass; the default is a no-op.
	 */
	onDeviceConnect() {
		return;
	}

	/**
	 * Called when the device's WebSocket connection drops (clean close, network
	 * loss, or device reboot). Override on your subclass to react; the default
	 * is a no-op. The device will reconnect automatically.
	 */
	onDeviceDisconnect() {
		return;
	}

	/**
	 * Called for every event the device emits over WebSocket — sensor reads,
	 * GPIO transitions, command acks/errors, temperature readings, I2C results.
	 *
	 * `message` is a discriminated union; narrow on `message.type` before
	 * accessing `message.payload`.
	 *
	 * @example
	 * onMessage(message: DeviceResponse) {
	 *   if (message.type === "pin_state_update" && message.payload.mode === "digital") {
	 *     console.log(`pin ${message.payload.pin} = ${message.payload.value}`);
	 *   } else if (message.type === "command_error") {
	 *     console.error(`command ${message.payload.command_type} failed: ${message.payload.error}`);
	 *   }
	 * }
	 */
	onMessage(_message: DeviceResponse) {
		return;
	}

	/**
	 * Called when a named cron defined in `crons` fires.
	 * Override this method to handle scheduled work.
	 *
	 * @param name - The key from the `crons` object that triggered this call.
	 */
	onCron(_name: string) {
		return;
	}
}
