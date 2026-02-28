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
      catch { return JSON.stringify([String(args)]); }
    }

    function persist(level, args) { device.persistLog(level, serialize(args)).catch(() => {}); }

    console.log = (...args) => { _log(prefix, ...args); persist('log', args); };
    console.info = (...args) => { _info(prefix, ...args); persist('info', args); };
    console.warn = (...args) => { _warn(prefix, ...args); persist('warn', args); };
    console.error = (...args) => { _error(prefix, ...args); persist('error', args); };
    console.debug = (...args) => { _debug(prefix, ...args); persist('debug', args); };

    const target = new ${entrypointName}(this.ctx, this.env);

    return {
    	onMessage: (...args) => target.onMessage(...args),
    	onDeviceConnect: (...args) => target.onDeviceConnect(...args),
    	onDeviceDisconnect: (...args) => target.onDeviceDisconnect(...args),
    	onAlarm: (...args) => target.onAlarm(...args),
    }
  }
}`;
}
