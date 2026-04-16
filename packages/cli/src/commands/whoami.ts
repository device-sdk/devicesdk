import { getMe } from "../api.js";
import { requireAuth } from "../credentials.js";
import { EXIT } from "../exitCodes.js";

export default async function whoami(): Promise<void> {
	try {
		const token = await requireAuth();
		const user = await getMe(token);

		console.log(`Logged in as: ${user.email}`);
		console.log(`User ID: ${user.id}`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			console.error("✗ Error: Not logged in\n");
			console.error("  Run `devicesdk login` to authenticate.");
			process.exit(EXIT.NOT_AUTHENTICATED);
		}
		console.error("✗ Error: Failed to get user info\n");
		if (error instanceof Error) {
			console.error(`  ${error.message}`);
		}
		process.exit(EXIT.GENERIC);
	}
}
