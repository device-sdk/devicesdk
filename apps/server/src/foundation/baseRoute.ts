import {
	InputValidationException,
	MultiException,
	OpenAPIRoute,
} from "chanfana";

/**
 * Base route class that fixes ZodError instanceof failures in the Workers runtime.
 *
 * The Cloudflare Workers bundler can create multiple Zod module instances,
 * breaking chanfana's `instanceof ZodError` check. This override uses
 * duck-typing to catch ZodErrors regardless of which Zod instance created them,
 * converting them to chanfana's MultiException for proper 400 response formatting.
 */
export class BaseRoute extends OpenAPIRoute {
	protected handleError(error: unknown): unknown {
		if (
			error &&
			typeof error === "object" &&
			"issues" in error &&
			Array.isArray((error as { issues: unknown }).issues)
		) {
			const issues = (
				error as {
					issues: Array<{
						message: string;
						path?: Array<string | number>;
					}>;
				}
			).issues;
			return new MultiException(
				issues.map(
					(issue) =>
						new InputValidationException(
							issue.message,
							issue.path?.map(String) ?? [],
						),
				),
			);
		}
		return error;
	}
}
