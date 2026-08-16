import {
	InputValidationException,
	MultiException,
	OpenAPIRoute,
} from "chanfana";

/**
 * Base route class that normalizes Zod validation failures into chanfana's
 * MultiException for consistent 400 response formatting.
 *
 * The check is shape-based (duck-typed) rather than `instanceof ZodError` so
 * it works regardless of which Zod instance produced the error - chanfana and
 * the app may resolve separate copies of the Zod module in the dependency
 * tree, and instanceof checks across those copies silently fail.
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
