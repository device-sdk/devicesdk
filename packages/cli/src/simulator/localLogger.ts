import type { LoggerInterface } from "@devicesdk/core";

export class LocalLogger implements LoggerInterface {
	private prefix: string;

	constructor(deviceId: string) {
		this.prefix = `[${deviceId}]`;
	}

	debug(...args: unknown[]): void {
		console.debug(this.prefix, ...args);
	}

	info(...args: unknown[]): void {
		console.info(this.prefix, ...args);
	}

	log(...args: unknown[]): void {
		console.log(this.prefix, ...args);
	}

	warn(...args: unknown[]): void {
		console.warn(this.prefix, ...args);
	}

	error(...args: unknown[]): void {
		console.error(this.prefix, ...args);
	}
}
