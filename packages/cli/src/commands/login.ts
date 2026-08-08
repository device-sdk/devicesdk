import open from "open";
import {
	DeviceSDKApiError,
	getApiUrl,
	getMe,
	pollAuth,
	setApiUrl,
	setVerbose,
	startAuth,
} from "../api.js";
import { type Credentials, saveCredentials } from "../credentials.js";
import { EXIT } from "../exitCodes.js";

const MIN_POLL_INTERVAL = 2000; // floor for a pathological server interval
const MAX_POLL_INTERVAL = 10000; // cap so a misconfigured server can't crawl
const MAX_POLL_TIME = 600000; // 10-minute hard cap regardless of expires_in
const POLL_ERROR_RETRIES = 3; // transient poll failures before giving up

let isVerbose = false;

export default async function login(options?: {
	verbose?: boolean;
	host?: string;
}): Promise<void> {
	if (options?.verbose) {
		setVerbose(true);
		isVerbose = true;
	}

	if (options?.host) {
		setApiUrl(options.host);
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
			// Ignore errors opening the browser
		});

		console.log("Waiting for authentication...");

		// The server tells us how long the device code lives and how often to
		// poll - honour it (with a sane cap and floor) so slow typists are not
		// cut off at an arbitrary minute and a misconfigured server cannot
		// make the loop spin or crawl.
		const expiresInMs = authStart.expires_in * 1000;
		const deadline = Math.min(
			Number.isFinite(expiresInMs) && expiresInMs > 0
				? expiresInMs
				: MAX_POLL_TIME,
			MAX_POLL_TIME,
		);
		const serverIntervalMs = authStart.interval * 1000;
		const intervalMs =
			Number.isFinite(serverIntervalMs) && serverIntervalMs > 0
				? Math.min(
						Math.max(serverIntervalMs, MIN_POLL_INTERVAL),
						MAX_POLL_INTERVAL,
					)
				: MIN_POLL_INTERVAL;

		const startTime = Date.now();
		let authResult = null;
		let pollErrors = 0;

		while (!authResult && Date.now() - startTime < deadline) {
			await new Promise((resolve) => setTimeout(resolve, intervalMs));

			try {
				authResult = await pollAuth(authStart.device_code);
				pollErrors = 0;
			} catch (error) {
				// Transient poll failures (network blips, 5xx) must not abort
				// the whole login - retry a bounded number of times. 4xx
				// failures are deterministic and abort immediately.
				if (error instanceof DeviceSDKApiError && error.statusCode < 500) {
					throw error;
				}
				pollErrors++;
				if (pollErrors >= POLL_ERROR_RETRIES) {
					throw error;
				}
				if (isVerbose) {
					process.stdout.write(
						`\rPoll failed (retry ${pollErrors}/${POLL_ERROR_RETRIES})...`,
					);
				}
				continue;
			}

			if (!authResult && isVerbose) {
				const elapsed = Math.round((Date.now() - startTime) / 1000);
				process.stdout.write(`\rWaiting for approval... (${elapsed}s)`);
			}
		}

		if (!authResult) {
			console.error("\n✗ Error: Authentication timed out\n");
			console.error("  Please try again with `devicesdk login`");
			process.exit(EXIT.GENERIC);
		}

		// Get user info (retry once if token not yet active)
		let user = null;
		try {
			user = await getMe(authResult.access_token);
		} catch (error) {
			if (
				error instanceof Error &&
				"statusCode" in error &&
				(error as Error & { statusCode: number }).statusCode === 401
			) {
				// Token might not be active yet; wait once and retry
				await new Promise((resolve) => setTimeout(resolve, intervalMs));
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
			// Persist the URL that was actually used: DEVICESDK_API_URL wins
			// over --host in getApiUrl(), so when both are set the requests
			// went to the env var URL - storing the --host URL would make the
			// next command target a different server.
			host: await getApiUrl(),
		};

		await saveCredentials(credentials);

		console.log(`\n✓ Logged in as ${user.email}`);
	} catch (error) {
		console.error("\n✗ Error: Authentication failed\n");
		if (error instanceof Error) {
			console.error(`  ${error.message}`);
		}
		process.exit(EXIT.GENERIC);
	}
}
