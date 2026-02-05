import { WorkerEntrypoint } from "cloudflare:workers";

export abstract class ProxyEntrypoint extends WorkerEntrypoint {
	abstract getTarget(): object;
}

export function getProxyEntrypoint(entrypointName: string): string {
	return `import { WorkerEntrypoint } from "cloudflare:workers";
import {${entrypointName}} from './device.js';

export class ProxyEntrypoint extends WorkerEntrypoint {
  getTarget() {
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
