import { getMe } from "../api.js";
import { requireAuth } from "../credentials.js";
import { EXIT } from "../exitCodes.js";
import { emitJsonError, emitJsonSuccess, isJsonMode } from "../output.js";

interface WhoamiOptions {
	json?: boolean;
}

export default async function whoami(
	options: WhoamiOptions = {},
): Promise<void> {
	const json = isJsonMode(options);
	try {
		const token = await requireAuth();
		const user = await getMe(token);

		if (json) {
			emitJsonSuccess({ id: user.id, email: user.email });
			return;
		}
		console.log(`Logged in as: ${user.email}`);
		console.log(`User ID: ${user.id}`);
	} catch (error) {
		const code =
			(error as NodeJS.ErrnoException).code === "ENOENT"
				? "not_authenticated"
				: undefined;
		const message =
			code === "not_authenticated"
				? "Not logged in. Run `devicesdk login` to authenticate."
				: error instanceof Error
					? error.message
					: "Failed to get user info";

		if (json) {
			emitJsonError(message, {
				code,
				docs: "https://devicesdk.com/docs/cli/login/",
			});
		} else {
			console.error("✗ Error: Failed to get user info\n");
			console.error(`  ${message}`);
		}
		process.exit(
			code === "not_authenticated" ? EXIT.NOT_AUTHENTICATED : EXIT.GENERIC,
		);
	}
}
