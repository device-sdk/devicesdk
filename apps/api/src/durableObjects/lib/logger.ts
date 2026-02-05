import { WorkerEntrypoint } from "cloudflare:workers";

export interface LoggerProps {
	deviceId: string;
	projectId: string;
}

// WorkerEntrypoint that provides logging capabilities to user code
// Runs in the DO context via ctx.exports, so console calls go to the DO's logs
export class Logger extends WorkerEntrypoint<unknown, LoggerProps> {
	private get prefix(): string {
		return `[${this.ctx.props.projectId}:${this.ctx.props.deviceId}]`;
	}

	async debug(...args: unknown[]): Promise<void> {
		console.debug(this.prefix, ...args);
	}

	async info(...args: unknown[]): Promise<void> {
		console.info(this.prefix, ...args);
	}

	async log(...args: unknown[]): Promise<void> {
		console.log(this.prefix, ...args);
	}

	async warn(...args: unknown[]): Promise<void> {
		console.warn(this.prefix, ...args);
	}

	async error(...args: unknown[]): Promise<void> {
		console.error(this.prefix, ...args);
	}
}
