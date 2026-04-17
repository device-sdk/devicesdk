import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { refreshToken as apiRefreshToken } from "./api.js";
import { EXIT } from "./exitCodes.js";

export interface Credentials {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	email: string;
}

const CREDENTIALS_DIR = path.join(os.homedir(), ".devicesdk");
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, "credentials.json");

export async function getCredentialsPath(): Promise<string> {
	return CREDENTIALS_FILE;
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
	await fs.mkdir(CREDENTIALS_DIR, { recursive: true });
	await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
		mode: 0o600,
	});
}

export async function loadCredentials(): Promise<Credentials | null> {
	try {
		const data = await fs.readFile(CREDENTIALS_FILE, "utf-8");
		return JSON.parse(data) as Credentials;
	} catch {
		return null;
	}
}

export async function deleteCredentials(): Promise<void> {
	try {
		await fs.unlink(CREDENTIALS_FILE);
	} catch {
		// File doesn't exist, ignore
	}
}

export async function getToken(): Promise<string | null> {
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

	// Check if token is expired (with 5 minute buffer)
	const now = Date.now();
	const expiresAt = credentials.expiresAt;
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
			};
			await saveCredentials(newCredentials);
			return newCredentials.accessToken;
		} catch {
			// Refresh failed, credentials are invalid
			return null;
		}
	}

	return credentials.accessToken;
}

export async function requireAuth(): Promise<string> {
	const token = await getToken();
	if (!token) {
		console.error("✗ Error: Authentication required\n");
		console.error("  Please run `devicesdk login` to authenticate.");
		process.exit(EXIT.NOT_AUTHENTICATED);
	}
	return token;
}
