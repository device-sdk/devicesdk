import { revokeToken } from "../api.js";
import { deleteCredentials, loadCredentials } from "../credentials.js";
import { EXIT } from "../exitCodes.js";

export default async function logout(): Promise<void> {
	try {
		const credentials = await loadCredentials();

		if (credentials) {
			// Try to revoke token on server
			try {
				await revokeToken(credentials.accessToken);
			} catch {
				// Ignore errors revoking token
			}
		}

		await deleteCredentials();

		console.log("✓ Logged out successfully");
	} catch (error) {
		console.error("✗ Error: Failed to logout\n");
		if (error instanceof Error) {
			console.error(`  ${error.message}`);
		}
		process.exit(EXIT.GENERIC);
	}
}
