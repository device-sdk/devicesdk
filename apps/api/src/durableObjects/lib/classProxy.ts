import { WorkerEntrypoint } from "cloudflare:workers";

export abstract class ProxyEntrypoint extends WorkerEntrypoint {
	abstract getTarget(): object;
}

export function getProxyEntrypoint(entrypointName: string): string {
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

    // Build DEVICES proxy for inter-device RPC
    const bridge = this.env.__DEVICE_BRIDGE;
    let currentCallDepth = 0;

    const devicesProxy = new Proxy({}, {
      get(_, deviceSlug) {
        if (typeof deviceSlug !== 'string') return undefined;
        return new Proxy({}, {
          get(_, methodName) {
            if (typeof methodName !== 'string') return undefined;
            if (methodName === 'then') return undefined;
            return (...args) => bridge.callRemoteMethod(
              deviceSlug, methodName, args, currentCallDepth
            );
          }
        });
      }
    });

    const env = Object.assign({}, this.env, { DEVICES: devicesProxy });
    const target = new ${entrypointName}(this.ctx, env);

    const BLOCKED_METHODS = new Set([
      'onMessage', 'onDeviceConnect', 'onDeviceDisconnect', 'onAlarm',
      'constructor', 'env', 'ctx'
    ]);

    return {
    	onMessage: (...args) => target.onMessage(...args),
    	onDeviceConnect: (...args) => target.onDeviceConnect(...args),
    	onDeviceDisconnect: (...args) => target.onDeviceDisconnect(...args),
    	onAlarm: (...args) => target.onAlarm(...args),
    	callMethod: (name, args, callDepth) => {
    	  if (BLOCKED_METHODS.has(name)) throw new Error('Cannot call "' + name + '" remotely');
    	  if (typeof target[name] !== 'function') throw new Error('Method "' + name + '" not found');
    	  currentCallDepth = callDepth || 0;
    	  return target[name](...args);
    	},
    }
  }
}`;
}
