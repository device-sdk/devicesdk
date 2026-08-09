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
		// Not-logged-in is handled inside requireAuth (it exits with
		// NOT_AUTHENTICATED and its own message) - anything reaching this
		// catch is a real getMe failure.
		const message =
			error instanceof Error ? error.message : "Failed to get user info";

		if (json) {
			emitJsonError(message, {
				code: "failed_to_get_user_info",
				docs: "https://docs.devicesdk.com/cli/login/",
			});
		} else {
			console.error("✗ Error: Failed to get user info\n");
			console.error(`  ${message}`);
		}
		process.exit(EXIT.GENERIC);
	}
}
