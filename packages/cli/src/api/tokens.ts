import { fetchAllPages, request } from "./shared.js";

// Token endpoints
export interface ApiToken {
	id: string;
	token?: string;
	last_four: string;
	created_at: number;
}

export async function listTokens(token: string): Promise<ApiToken[]> {
	return fetchAllPages<ApiToken>("/v1/tokens", token);
}

export async function createToken(
	token: string,
): Promise<{ id: string; token: string; created_at: number }> {
	return request<{ id: string; token: string; created_at: number }>(
		"/v1/tokens",
		{
			method: "POST",
		},
		token,
	);
}

export async function deleteToken(
	token: string,
	tokenId: string,
): Promise<void> {
	await request(
		`/v1/tokens/${tokenId}`,
		{
			method: "DELETE",
		},
		token,
	);
}
