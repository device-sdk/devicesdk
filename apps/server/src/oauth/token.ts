import { hashToken } from "../foundation/tokenHash";
import type { AppContext, tableTokens } from "../types";
import {
	ACCESS_TOKEN_TTL_MS,
	ACCESS_TOKEN_TTL_SECONDS,
	deleteAuthCodeById,
	getAuthCodeByRawCode,
	getClient,
	oauthJsonError,
} from "./store";

/** Parses either application/x-www-form-urlencoded (required by RFC 6749) or JSON. */
async function parseTokenRequestBody(
	c: AppContext,
): Promise<Record<string, string> | null> {
	const contentType = c.req.header("Content-Type") ?? "";
	try {
		if (contentType.includes("application/json")) {
			const json = await c.req.json();
			if (typeof json !== "object" || json === null) return null;
			const out: Record<string, string> = {};
			for (const [key, value] of Object.entries(
				json as Record<string, unknown>,
			)) {
				if (typeof value === "string") out[key] = value;
			}
			return out;
		}
		const text = await c.req.text();
		const params = new URLSearchParams(text);
		const out: Record<string, string> = {};
		for (const [key, value] of params) out[key] = value;
		return out;
	} catch {
		return null;
	}
}

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** PKCE S256 check: base64url(SHA-256(code_verifier)) === stored code_challenge. */
async function verifyPkce(
	codeVerifier: string,
	codeChallenge: string,
): Promise<boolean> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(codeVerifier),
	);
	return base64UrlEncode(new Uint8Array(digest)) === codeChallenge;
}

/**
 * POST /oauth/token - authorization_code grant only (no refresh grant; a
 * client re-runs the full OAuth flow after the 30-day access token expires).
 * RFC 6749 error/response shapes, not the `{success,result}` envelope.
 */
export async function handleTokenExchange(c: AppContext) {
	const body = await parseTokenRequestBody(c);
	if (!body) {
		return oauthJsonError(
			c,
			400,
			"invalid_request",
			"Request body could not be parsed.",
		);
	}

	if (body.grant_type !== "authorization_code") {
		return oauthJsonError(
			c,
			400,
			"unsupported_grant_type",
			'Only "authorization_code" is supported.',
		);
	}

	const {
		code,
		redirect_uri: redirectUri,
		client_id: clientId,
		code_verifier: codeVerifier,
	} = body;
	if (!code || !redirectUri || !clientId || !codeVerifier) {
		return oauthJsonError(
			c,
			400,
			"invalid_request",
			"code, redirect_uri, client_id, and code_verifier are all required.",
		);
	}
	if (codeVerifier.length < 43 || codeVerifier.length > 128) {
		return oauthJsonError(
			c,
			400,
			"invalid_request",
			"code_verifier must be between 43 and 128 characters (RFC 7636).",
		);
	}

	const client = await getClient(c, clientId);
	if (!client) {
		return oauthJsonError(c, 401, "invalid_client", "Unknown client_id.");
	}

	// Read the code WITHOUT consuming it: client_id/redirect_uri/PKCE are
	// verified against the row first, and only a fully verified exchange
	// deletes it (store.ts). A verification failure leaves the code intact so
	// the client can retry within the 10-minute window. Race safety comes from
	// the delete's row count: two concurrent exchanges of the same code both
	// verify, but only one DELETE removes a row - the loser gets
	// "already used" below.
	const authCode = await getAuthCodeByRawCode(c, code);
	if (!authCode) {
		return oauthJsonError(
			c,
			400,
			"invalid_grant",
			"Code is invalid, expired, or already used.",
		);
	}
	if (
		authCode.client_id !== clientId ||
		authCode.redirect_uri !== redirectUri
	) {
		return oauthJsonError(
			c,
			400,
			"invalid_grant",
			"client_id or redirect_uri does not match the authorization request.",
		);
	}
	const pkceOk = await verifyPkce(codeVerifier, authCode.code_challenge);
	if (!pkceOk) {
		return oauthJsonError(
			c,
			400,
			"invalid_grant",
			"code_verifier does not match code_challenge.",
		);
	}

	const consumed = await deleteAuthCodeById(c, authCode.id);
	if (!consumed) {
		return oauthJsonError(
			c,
			400,
			"invalid_grant",
			"Code is invalid, expired, or already used.",
		);
	}

	// Stamp the client as used so the janitor's idle sweep never drops an
	// actively used registration.
	await c.env.DB.prepare(
		"UPDATE oauth_clients SET last_used_at = ?1 WHERE id = ?2",
	)
		.bind(Date.now(), client.id)
		.run();

	const rawToken = crypto.randomUUID().replaceAll("-", "");
	const tokenHash = await hashToken(rawToken, c.env.config.apiTokenSecret);
	const now = Date.now();
	const description = `MCP: ${client.client_name}`.slice(0, 100);

	await c
		.get("qb")
		.insert<tableTokens>({
			tableName: "tokens",
			data: {
				id: crypto.randomUUID(),
				user_id: authCode.user_id,
				token_hash: tokenHash,
				last_four: rawToken.slice(-4),
				created_at: now,
				managed: 1,
				description,
				expires_at: now + ACCESS_TOKEN_TTL_MS,
			},
		})
		.execute();

	return c.json({
		access_token: rawToken,
		token_type: "Bearer",
		expires_in: ACCESS_TOKEN_TTL_SECONDS,
	});
}
