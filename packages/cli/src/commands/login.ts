import open from "open";
import { getMe, pollAuth, setVerbose, startAuth } from "../api.js";
import { type Credentials, saveCredentials } from "../credentials.js";

const POLL_INTERVAL = 5000; // 5 seconds
const MAX_POLL_TIME = 60000; // 1 minute

let isVerbose = false;

export default async function login(options?: {
	verbose?: boolean;
}): Promise<void> {
	if (options?.verbose) {
		setVerbose(true);
		isVerbose = true;
	}

	console.log("Starting authentication...\n");

	try {
		const authStart = await startAuth();

		const authUrl = `${authStart.verification_url}?code=${authStart.user_code}`;

		console.log(`Opening browser to authenticate...`);
		console.log(`If browser doesn't open, visit: ${authUrl}`);
		console.log(`Auth code: ${authStart.user_code}\n`);

		// Open browser
		await open(authUrl).catch(() => {
			// Ignore errors opening browser
		});

		console.log("Waiting for authentication...");

		const startTime = Date.now();
		let authResult = null;

		while (!authResult && Date.now() - startTime < MAX_POLL_TIME) {
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

			try {
				authResult = await pollAuth(authStart.device_code);
			} catch (error) {
				console.error("\npollAuth error:", error);
				throw error;
			}

			if (!authResult && isVerbose) {
				const elapsed = Math.round((Date.now() - startTime) / 1000);
				process.stdout.write(`\rWaiting for approval... (${elapsed}s)`);
			}
		}

		if (!authResult) {
			console.error("\n✗ Error: Authentication timed out\n");
			console.error("  Please try again with `devicesdk login`");
			process.exit(1);
		}

		// Get user info (retry once if token not yet active)
		let user = null;
		try {
			user = await getMe(authResult.access_token);
		} catch (error) {
			if (
				error instanceof Error &&
				"statusCode" in error &&
				(error as any).statusCode === 401
			) {
				// Token might not be active yet; wait once and retry
				await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
				user = await getMe(authResult.access_token);
			} else {
				throw error;
			}
		}

		// Save credentials
		const credentials: Credentials = {
			accessToken: authResult.access_token,
			refreshToken: authResult.refresh_token,
			expiresAt: Date.now() + authResult.expires_in * 1000,
			email: user.email,
		};

		await saveCredentials(credentials);

		console.log(`\n✓ Logged in as ${user.email}`);
	} catch (error) {
		console.error("\n✗ Error: Authentication failed\n");
		if (error instanceof Error) {
			console.error(`  ${error.message}`);
			console.error(`  Stack: ${error.stack}`);
		}
		process.exit(1);
	}
}
