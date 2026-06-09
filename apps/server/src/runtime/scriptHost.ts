import { pathToFileURL } from "node:url";
import type { DeviceResponse } from "@devicesdk/core";
import { JS_IDENTIFIER_REGEX } from "../foundation/consts";
import type { LocalDeviceSender } from "./deviceSender";
import { BLOCKED_METHODS } from "./rpcConstants";
import type { IUserDeviceWorker } from "./types";

/** Inter-device RPC dispatch, injected to avoid a circular import. */
export type BridgeFn = (
	targetDeviceSlug: string,
	methodName: string,
	args: unknown[],
	callDepth: number,
) => Promise<unknown>;

export interface ScriptHostOptions {
	/** Absolute path to the version-keyed bundle file on disk. */
	scriptPath: string;
	entrypointName: string;
	sender: LocalDeviceSender;
	bridge: BridgeFn;
	/** Live project env-var snapshot provider (sync DB read). */
	getEnvVars: () => Record<string, string>;
}

function makeDevicesProxy(bridge: BridgeFn, depth: number): unknown {
	return new Proxy(
		{},
		{
			get(_, deviceSlug) {
				if (typeof deviceSlug !== "string") return undefined;
				return new Proxy(
					{},
					{
						get(_t, methodName) {
							if (typeof methodName !== "string") return undefined;
							if (methodName === "then") return undefined;
							return (...args: unknown[]) =>
								bridge(deviceSlug, methodName, args, depth);
						},
					},
				);
			},
		},
	);
}

type UserClass = new (
	ctx: object,
	env: unknown,
) => Record<string, unknown> & {
	crons?: Record<string, string>;
	env: unknown;
};

/**
 * Loads a user device-script bundle via dynamic import() and wraps it in the
 * same handler surface the Worker Loader proxy entrypoint used to expose
 * (classProxy.ts). The bundle file is version-keyed, so the ES module cache
 * never serves a stale script: a new deploy means a new path.
 *
 * User code runs in-process by design — it is the user's own code on the
 * user's own server, the same trust level as the server itself.
 */
export async function loadUserWorker(
	options: ScriptHostOptions,
): Promise<IUserDeviceWorker> {
	const { scriptPath, entrypointName, sender, bridge, getEnvVars } = options;

	if (!JS_IDENTIFIER_REGEX.test(entrypointName)) {
		throw new Error("Invalid entrypoint name");
	}

	const mod = (await import(pathToFileURL(scriptPath).href)) as Record<
		string,
		unknown
	>;
	const cls = (mod[entrypointName] ?? mod.default) as UserClass | undefined;
	if (typeof cls !== "function") {
		throw new Error(
			`Script does not export "${entrypointName}" (exports found: ${Object.keys(mod).join(", ") || "none"})`,
		);
	}

	const VARS = {
		get: async (key: string) => getEnvVars()[key],
		getAll: async () => ({ ...getEnvVars() }),
	};

	const env = Object.freeze({
		DEVICE: sender,
		DEVICES: makeDevicesProxy(bridge, 0),
		VARS,
	});

	const target = new cls({}, env);

	const blocked = new Set<string>(BLOCKED_METHODS);

	const worker: IUserDeviceWorker = {
		onDeviceConnect: async () => {
			await (
				target.onDeviceConnect as (() => Promise<void> | void) | undefined
			)?.call(target);
		},
		onDeviceDisconnect: async () => {
			await (
				target.onDeviceDisconnect as (() => Promise<void> | void) | undefined
			)?.call(target);
		},
		onMessage: async (message: DeviceResponse) => {
			await (
				target.onMessage as
					| ((m: DeviceResponse) => Promise<void> | void)
					| undefined
			)?.call(target, message);
		},
		getCrons: async () => target.crons ?? {},
		onCron: async (name: string) => {
			await (
				target.onCron as ((n: string) => Promise<void> | void) | undefined
			)?.call(target, name);
		},
		callMethod: async (name, args, callDepth) => {
			if (blocked.has(name)) {
				throw new Error(`Cannot call "${name}" remotely`);
			}
			// Only methods defined on the user's own class are callable —
			// inherited DeviceEntrypoint/Object methods are not RPC surface.
			const userProto = Object.getPrototypeOf(target);
			if (!userProto || !Object.hasOwn(userProto, name)) {
				throw new Error(`Method "${name}" not found`);
			}
			if (typeof target[name] !== "function") {
				throw new Error(`Method "${name}" not found`);
			}
			const depth = callDepth ?? 0;
			// Thread the call depth through any nested DEVICES calls this method
			// makes, so call cycles bottom out at MAX_CALL_DEPTH.
			const scopedEnv = Object.freeze({
				...(target.env as object),
				DEVICES: makeDevicesProxy(bridge, depth),
			});
			const scopedTarget = new Proxy(target, {
				get(t, prop) {
					if (prop === "env") return scopedEnv;
					const val = t[prop as keyof typeof t];
					return typeof val === "function" ? val.bind(t) : val;
				},
			});
			return await (
				scopedTarget[name] as (...a: unknown[]) => Promise<unknown>
			)(...args);
		},
	};

	// Only expose onAlarm when the user script actually defines it, so the
	// session can short-circuit instead of dispatching a no-op.
	if (typeof target.onAlarm === "function") {
		worker.onAlarm = async () => {
			await (target.onAlarm as () => Promise<void> | void).call(target);
		};
	}

	return worker;
}
