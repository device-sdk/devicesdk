import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { refreshToken as apiRefreshToken, DeviceSDKApiError } from "./api.js";
import { EXIT } from "./exitCodes.js";
import { emitJsonError, isJsonMode } from "./output.js";

export interface Credentials {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	email: string;
	/** Base URL of the self-hosted server this login belongs to. */
	host?: string;
}

// Internal sentinel returned by getToken() when the refresh attempt is
// rejected by the API (vs. simply not present). Lets requireAuth() print the
// "Session expired" line instead of the generic "Authentication required".
const SESSION_EXPIRED = Symbol("SESSION_EXPIRED");

const CREDENTIALS_DIR = path.join(os.homedir(), ".devicesdk");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

export async function getCredentialsPath(): Promise<string> {
	return CREDENTIALS_FILE;
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
	await fs.mkdir(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
	// Write to a temp file and rename so a crash mid-write cannot truncate the
	// real file (a corrupt credentials.json would silently log the user out).
	const tmpFile = `${CREDENTIALS_FILE}.tmp`;
	await fs.writeFile(tmpFile, JSON.stringify(credentials, null, 2), {
		mode: 0o600,
	});
	// chmod after write too: writeFile mode is masked by the umask, so the
	// file may be more permissive than 0600 without this.
	await fs.chmod(tmpFile, 0o600);
	await fs.rename(tmpFile, CREDENTIALS_FILE);
}

export async function loadCredentials(): Promise<Credentials | null> {
	let raw: string;
	try {
		raw = await fs.readFile(CREDENTIALS_FILE, "utf-8");
	} catch {
		// File missing or unreadable - treat as not logged in.
		return null;
	}
	try {
		return JSON.parse(raw) as Credentials;
	} catch {
		// A truncated/corrupt file must not masquerade as "not logged in" -
		// that produces a confusing "Authentication required". Surface the
		// real problem instead.
		if (isJsonMode()) {
			emitJsonError(
				"Credentials file is corrupt - run `devicesdk login` to re-authenticate.",
				{
					code: "credentials_corrupt",
					docs: "https://docs.devicesdk.com/cli/login/",
				},
			);
		} else {
			console.error(
				"✗ Error: Credentials file is corrupt - run `devicesdk login` to re-authenticate.",
			);
		}
		process.exit(EXIT.NOT_AUTHENTICATED);
	}
}

export async function deleteCredentials(): Promise<void> {
	try {
		await fs.unlink(CREDENTIALS_FILE);
	} catch {
		// File doesn't exist, ignore
	}
}

export async function getToken(): Promise<
	string | null | typeof SESSION_EXPIRED
> {
	// First check environment variable
	const envToken = process.env.DEVICESDK_TOKEN;
	if (envToken) {
		return envToken;
	}

	// Then check stored credentials
	const credentials = await loadCredentials();
	if (!credentials) {
		return null;
	}

	// Check if token is expired (with 5 minute buffer). A missing or
	// non-numeric expiresAt (old credential files predate the field) is
	// treated as expired so the CLI refreshes proactively instead of only
	// noticing when the server rejects the token.
	const now = Date.now();
	const rawExpiresAt = credentials.expiresAt;
	const expiresAt =
		typeof rawExpiresAt === "number" && Number.isFinite(rawExpiresAt)
			? rawExpiresAt
			: 0;
	const buffer = 5 * 60 * 1000; // 5 minutes

	if (now >= expiresAt - buffer) {
		// Token is expired or about to expire, try to refresh
		try {
			const response = await apiRefreshToken(credentials.refreshToken);
			const newCredentials: Credentials = {
				accessToken: response.access_token,
				refreshToken: response.refresh_token,
				expiresAt: Date.now() + response.expires_in * 1000,
				email: credentials.email,
				host: credentials.host,
			};
			await saveCredentials(newCredentials);
			return newCredentials.accessToken;
		} catch (error) {
			// Only a 401 (or a 400 with an auth-shaped code) means the stored
			// refresh token is no longer honoured - surface "Session expired"
			// so the CLI prints one line instead of the generic "Authentication
			// required". Rate limits (429), missing endpoints (404), and other
			// failures are real errors and must propagate, not be masked.
			if (
				error instanceof DeviceSDKApiError &&
				isSessionExpiryError(error.statusCode, error.code)
			) {
				return SESSION_EXPIRED;
			}
			if (error instanceof DeviceSDKApiError) {
				throw error;
			}
			// Network errors and other failures: keep the prior behaviour of
			// treating the credentials as missing.
			return null;
		}
	}

	return credentials.accessToken;
}

function isSessionExpiryError(status: number, code?: string): boolean {
	if (status === 401) return true;
	const authCodes = new Set([
		"invalid_refresh_token",
		"invalid_token",
		"invalid_cli_token",
		"missing_credentials",
		"unauthorized",
	]);
	return status === 400 && code !== undefined && authCodes.has(code);
}

export async function requireAuth(): Promise<string> {
	const token = await getToken();
	// Honour DEVICESDK_OUTPUT=json so JSON consumers (the MCP server, agents,
	// scripts) get a parseable failure rather than stderr noise + empty stdout.
	const json = isJsonMode();
	const docs = "https://docs.devicesdk.com/cli/login/";
	if (token === SESSION_EXPIRED) {
		if (json) {
			emitJsonError("Session expired - run `devicesdk login`.", {
				code: "session_expired",
				docs,
			});
		} else {
			console.error("✗ Session expired - run `devicesdk login`.");
		}
		process.exit(EXIT.NOT_AUTHENTICATED);
	}
	if (!token) {
		if (json) {
			emitJsonError(
				"Authentication required. Run `devicesdk login` to authenticate.",
				{ code: "not_authenticated", docs },
			);
		} else {
			console.error("✗ Error: Authentication required\n");
			console.error("  Please run `devicesdk login` to authenticate.");
		}
		process.exit(EXIT.NOT_AUTHENTICATED);
	}
	return token;
}
