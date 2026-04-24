import { WorkerEntrypoint } from "cloudflare:workers";
import { BLOCKED_METHODS } from "./rpcConstants";

export abstract class ProxyEntrypoint extends WorkerEntrypoint {
	abstract getTarget(): object;
}

export function getProxyEntrypoint(entrypointName: string): string {
	if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(entrypointName)) {
		throw new Error("Invalid entrypoint name");
	}
	const blockedMethodsLiteral = BLOCKED_METHODS.map((m) => `'${m}'`).join(", ");
	return `import { WorkerEntrypoint } from "cloudflare:workers";
import {${entrypointName}} from './device.js';

export class ProxyEntrypoint extends WorkerEntrypoint {
  getTarget() {
    const device = this.env.DEVICE;
    const prefix = '[' + this.env.__PROJECT_ID + ':' + this.env.__DEVICE_ID + ']';

    const _log = console.log.bind(console);
    const _info = console.info.bind(console);
    const _warn = console.warn.bind(console);
    const _error = console.error.bind(console);
    const _debug = console.debug.bind(console);

    function serialize(args) {
      try { return JSON.stringify(args); }
      catch { return JSON.stringify(args.map(String)); }
    }

    function persist(level, args) { device.persistLog(level, serialize(args)).catch(() => {}); }

    console.log = (...args) => { _log(prefix, ...args); persist('log', args); };
    console.info = (...args) => { _info(prefix, ...args); persist('info', args); };
    console.warn = (...args) => { _warn(prefix, ...args); persist('warn', args); };
    console.error = (...args) => { _error(prefix, ...args); persist('error', args); };
    console.debug = (...args) => { _debug(prefix, ...args); persist('debug', args); };

    // Strip internal bindings from user-facing env
    const { __DEVICE_BRIDGE: bridge, __DEVICE_ID: _did, __PROJECT_ID: _pid, __ENV_VARS: _envVarsJson, ...publicEnv } = this.env;

    const ALLOWED_DEVICE_METHODS = new Set([
        'sendCommand', 'sendCommandAndWait', 'reboot', 'setGpioState', 'setPwmState',
        'getPinState', 'i2cScan', 'i2cWrite', 'i2cRead', 'configureGpioInputMonitoring',
        'getTemperature', 'watchdogConfigure', 'watchdogFeed',
        'spiConfigure', 'spiTransfer', 'spiWrite', 'spiRead',
        'uartConfigure', 'uartWrite', 'uartRead',
        'pioWs2812Configure', 'pioWs2812Update', 'persistLog', 'emitState',
        'kvGet', 'kvPut', 'kvDelete', 'kvList'
    ]);
    const safeDevice = new Proxy(publicEnv.DEVICE, {
        get(target, prop) {
            if (typeof prop === 'string' && ALLOWED_DEVICE_METHODS.has(prop)) return target[prop].bind(target);
            if (prop === 'kv') return target.kv;
            return undefined;
        }
    });

    /** @type {Record<string, string>} */
    let _envVars = {};
    try { _envVars = _envVarsJson ? JSON.parse(_envVarsJson) : {}; } catch {}
    const VARS = {
      get: async (key) => _envVars[key],
      getAll: async () => ({ ..._envVars }),
    };

    const devicesProxy = new Proxy({}, {
      get(_, deviceSlug) {
        if (typeof deviceSlug !== 'string') return undefined;
        return new Proxy({}, {
          get(_, methodName) {
            if (typeof methodName !== 'string') return undefined;
            if (methodName === 'then') return undefined;
            return (...args) => bridge.callRemoteMethod(
              deviceSlug, methodName, args, 0
            );
          }
        });
      }
    });

    const env = Object.freeze(Object.assign({}, publicEnv, { DEVICE: safeDevice, DEVICES: devicesProxy, VARS }));
    const target = new ${entrypointName}(this.ctx, env);

    const BLOCKED_METHODS = new Set([${blockedMethodsLiteral}]);

    return {
    	onMessage: (...args) => target.onMessage(...args),
    	onDeviceConnect: (...args) => target.onDeviceConnect(...args),
    	onDeviceDisconnect: (...args) => target.onDeviceDisconnect(...args),
    	onAlarm: (...args) => target.onAlarm?.(...args),
    	getCrons: async () => target.crons ?? {},
    	onCron: (...args) => target.onCron?.(...args),
    	callMethod: async (name, args, callDepth) => {
    	  if (BLOCKED_METHODS.has(name)) throw new Error('Cannot call "' + name + '" remotely');
    	  const userProto = Object.getPrototypeOf(target);
    	  if (!userProto || !Object.prototype.hasOwnProperty.call(userProto, name)) {
    	    throw new Error('Method "' + name + '" not found');
    	  }
    	  if (typeof target[name] !== 'function') throw new Error('Method "' + name + '" not found');
    	  const depth = callDepth ?? 0;
    	  const callScopedDevices = new Proxy({}, {
    	    get(_, deviceSlug) {
    	      if (typeof deviceSlug !== 'string') return undefined;
    	      return new Proxy({}, {
    	        get(_, methodName) {
    	          if (typeof methodName !== 'string') return undefined;
    	          if (methodName === 'then') return undefined;
    	          return (...rpcArgs) => bridge.callRemoteMethod(deviceSlug, methodName, rpcArgs, depth);
    	        }
    	      });
    	    }
    	  });
    	  const scopedEnv = Object.freeze(Object.assign({}, target.env, { DEVICES: callScopedDevices }));
    	  const scopedTarget = new Proxy(target, {
    	    get(t, prop) {
    	      if (prop === 'env') return scopedEnv;
    	      const val = t[prop];
    	      return typeof val === 'function' ? val.bind(t) : val;
    	    }
    	  });
    	  return await scopedTarget[name](...args);
    	},
    }
  }
}`;
}
