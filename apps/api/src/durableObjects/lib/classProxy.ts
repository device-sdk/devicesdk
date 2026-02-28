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

    console.log = (...args) => { _log(prefix, ...args); device.persistLog('log', serialize(args)); };
    console.info = (...args) => { _info(prefix, ...args); device.persistLog('info', serialize(args)); };
    console.warn = (...args) => { _warn(prefix, ...args); device.persistLog('warn', serialize(args)); };
    console.error = (...args) => { _error(prefix, ...args); device.persistLog('error', serialize(args)); };
    console.debug = (...args) => { _debug(prefix, ...args); device.persistLog('debug', serialize(args)); };

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
