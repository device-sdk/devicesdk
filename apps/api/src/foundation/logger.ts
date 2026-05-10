import * as Sentry from "@sentry/cloudflare";

type LogContext = Record<string, unknown>;

function withBreadcrumb(
	level: "info" | "warning",
	message: string,
	ctx?: LogContext,
) {
	Sentry.addBreadcrumb({
		category: "app",
		level,
		message,
		data: ctx,
	});
}

export const logger = {
	debug(message: string, ctx?: LogContext): void {
		console.log(message, ctx ?? "");
	},

	info(message: string, ctx?: LogContext): void {
		console.log(message, ctx ?? "");
		withBreadcrumb("info", message, ctx);
	},

	warn(message: string, ctx?: LogContext): void {
		console.warn(message, ctx ?? "");
		withBreadcrumb("warning", message, ctx);
	},

	error(err: unknown, message?: string, ctx?: LogContext): void {
		const tag = message ? `${message}: ` : "";
		console.error(
			tag + (err instanceof Error ? (err.stack ?? err.message) : String(err)),
			ctx ?? "",
		);
		Sentry.captureException(err, {
			extra: { ...(ctx ?? {}), ...(message ? { message } : {}) },
		});
	},
};
