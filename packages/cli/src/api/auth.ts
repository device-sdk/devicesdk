import {
	buildErrorMessage,
	DeviceSDKApiError,
	dumpResponseBodyIfVerbose,
	getApiUrl,
	parseErrorBody,
	request,
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

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({}),
		});

		const responseText = await response.text();
		let data: unknown = null;
		try {
			data = responseText ? JSON.parse(responseText) : null;
		} catch {
			// non-JSON response body
		}

		if (!response.ok) {
			const parsed = parseErrorBody(data);
			dumpResponseBodyIfVerbose(response.status, data, responseText);
			throw new DeviceSDKApiError(
				buildErrorMessage(response.status, parsed),
				response.status,
				parsed.code,
				parsed.docs,
				data ?? responseText,
			);
		}

		// Unwrap the result
		const obj = data as { result?: AuthStartResponse } | null;
		return obj?.result ?? (data as AuthStartResponse);
	} catch (error) {
		console.error("startAuth error:", error);
		throw error;
	}
}

export interface AuthPollResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
}

export async function pollAuth(
	deviceCode: string,
): Promise<AuthPollResponse | null> {
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

		// Check if the response indicates pending status
		if (
			result &&
			typeof result === "object" &&
			"status" in result &&
			result.status === "pending"
		) {
			return null;
		}

		return result as AuthPollResponse;
	} catch (error) {
		// If it's a 401 error, return null (user hasn't approved yet)
		if (error instanceof DeviceSDKApiError && error.statusCode === 401) {
			return null;
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
