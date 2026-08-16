import {
	buildErrorMessage,
	DEFAULT_REQUEST_TIMEOUT_MS,
	DeviceSDKApiError,
	dumpResponseBodyIfVerbose,
	getApiUrl,
	parseErrorBody,
	request,
	runWithTimeout,
} from "./shared.js";

// User endpoints
export interface User {
	id: string;
	name?: string;
	picture?: string;
	email: string;
	verified_email: number;
	created_at: number;
}

export async function getMe(token: string): Promise<User> {
	return request<User>("/v1/user/me", {}, token);
}

// CLI Auth endpoints
export interface AuthStartResponse {
	device_code: string;
	user_code: string;
	verification_url: string;
	verification_url_complete?: string;
	expires_in: number;
	interval: number;
}

export async function startAuth(): Promise<AuthStartResponse> {
	const url = `${await getApiUrl()}/v1/cli/auth/start`;

	const responseText = await runWithTimeout(async (signal) => {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({}),
			signal,
		});

		if (!response.ok) {
			const rawText = await response.text();
			let data: unknown = null;
			try {
				data = rawText ? JSON.parse(rawText) : null;
			} catch {
				// non-JSON response body
			}
			const parsed = parseErrorBody(data);
			dumpResponseBodyIfVerbose(response.status, data, rawText);
			throw new DeviceSDKApiError(
				buildErrorMessage(response.status, parsed),
				response.status,
				parsed.code,
				parsed.docs,
				data ?? rawText,
			);
		}

		return response.text();
	}, DEFAULT_REQUEST_TIMEOUT_MS);

	let data: unknown = null;
	try {
		data = responseText ? JSON.parse(responseText) : null;
	} catch {
		// non-JSON response body
	}

	// Unwrap the result
	const obj = data as { result?: AuthStartResponse } | null;
	return obj?.result ?? (data as AuthStartResponse);
}

export interface AuthPollResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
}

export type AuthPollResult = AuthPollResponse | "pending" | "denied";

/**
 * Polls the device-code flow. Returns the token response once the user
 * approved, "pending" while they are still deciding (or the server 401s a
 * not-yet-active code), and "denied" if they rejected the request.
 */
export async function pollAuth(deviceCode: string): Promise<AuthPollResult> {
	try {
		const result = await request<AuthPollResponse | { status: string }>(
			"/v1/cli/auth/poll",
			{
				method: "POST",
				body: JSON.stringify({ device_code: deviceCode }),
			},
			undefined,
			true,
		);

		if (result && typeof result === "object" && "status" in result) {
			// Still waiting for the user to approve/reject the request.
			if (result.status === "pending") return "pending";
			// The user actively rejected the request - do NOT fall through to
			// the token path (a "denied" payload would otherwise be treated as
			// an approved AuthPollResponse and fail confusingly in getMe).
			if (result.status === "denied") return "denied";
		}

		return result as AuthPollResponse;
	} catch (error) {
		// If it's a 401 error, return null (user hasn't approved yet)
		if (error instanceof DeviceSDKApiError && error.statusCode === 401) {
			return "pending";
		}
		throw error;
	}
}

export async function refreshToken(
	refreshToken: string,
): Promise<AuthPollResponse> {
	return request<AuthPollResponse>("/v1/cli/auth/refresh", {
		method: "POST",
		body: JSON.stringify({ refresh_token: refreshToken }),
	});
}

export async function revokeToken(token: string): Promise<void> {
	await request(
		"/v1/cli/auth/revoke",
		{
			method: "POST",
		},
		token,
	);
}
