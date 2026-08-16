import type { ContentfulStatusCode } from "hono/utils/http-status";
import { hashToken } from "../foundation/tokenHash";
import type {
	AppContext,
	tableOauthAuthCodes,
	tableOauthClients,
} from "../types";

export const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const ACCESS_TOKEN_TTL_SECONDS = Math.floor(ACCESS_TOKEN_TTL_MS / 1000);

export interface OauthClient {
	id: string;
	client_name: string;
	redirect_uris: string[];
	created_at: number;
	last_used_at: number | null;
}

function parseClientRow(row: tableOauthClients): OauthClient {
	let redirectUris: string[] = [];
	try {
		const parsed = JSON.parse(row.redirect_uris);
		if (Array.isArray(parsed))
			redirectUris = parsed.filter((u) => typeof u === "string");
	} catch {
		redirectUris = [];
	}
	return {
		id: row.id,
		client_name: row.client_name,
		redirect_uris: redirectUris,
		created_at: row.created_at,
		last_used_at: row.last_used_at ?? null,
	};
}

/** RFC 7591 dynamic client registration: insert a new OAuth client. */
export async function insertClient(
	c: AppContext,
	params: { clientName: string; redirectUris: string[] },
): Promise<OauthClient> {
	const id = crypto.randomUUID();
	const created_at = Date.now();
	await c
		.get("qb")
		.insert<tableOauthClients>({
			tableName: "oauth_clients",
			data: {
				id,
				client_name: params.clientName,
				redirect_uris: JSON.stringify(params.redirectUris),
				created_at,
				last_used_at: null,
			},
		})
		.execute();
	return {
		id,
		client_name: params.clientName,
		redirect_uris: params.redirectUris,
		created_at,
		last_used_at: null,
	};
}

export async function getClient(
	c: AppContext,
	clientId: string,
): Promise<OauthClient | null> {
	const res = await c
		.get("qb")
		.fetchOne<tableOauthClients>({
			tableName: "oauth_clients",
			where: { conditions: ["id = ?1"], params: [clientId] },
		})
		.execute();
	return res.results ? parseClientRow(res.results) : null;
}

export interface StoredAuthCode {
	id: string;
	client_id: string;
	user_id: string;
	redirect_uri: string;
	code_challenge: string;
}

/** Mints a fresh authorization code (10 min TTL) and stores only its HMAC hash. */
export async function insertAuthCode(
	c: AppContext,
	params: {
		clientId: string;
		userId: string;
		redirectUri: string;
		codeChallenge: string;
	},
): Promise<string> {
	const rawCode = crypto.randomUUID().replaceAll("-", "");
	const codeHash = await hashToken(rawCode, c.env.config.apiTokenSecret);
	const now = Date.now();
	await c
		.get("qb")
		.insert<tableOauthAuthCodes>({
			tableName: "oauth_auth_codes",
			data: {
				id: crypto.randomUUID(),
				code_hash: codeHash,
				client_id: params.clientId,
				user_id: params.userId,
				redirect_uri: params.redirectUri,
				code_challenge: params.codeChallenge,
				created_at: now,
				expires_at: now + AUTH_CODE_TTL_MS,
			},
		})
		.execute();
	return rawCode;
}

/**
 * Reads a single-use authorization code WITHOUT consuming it. The token
 * endpoint verifies client_id, redirect_uri, and PKCE against the returned
 * row first, and only then deletes it (see deleteAuthCodeById) - so a
 * legitimate client with a transient mistake (wrong code_verifier, redirect
 * typo) can retry within the 10-minute window instead of being forced through
 * a full re-authorization.
 */
export async function getAuthCodeByRawCode(
	c: AppContext,
	rawCode: string,
): Promise<StoredAuthCode | null> {
	const codeHash = await hashToken(rawCode, c.env.config.apiTokenSecret);
	const row = await c.env.DB.prepare(
		"SELECT id, client_id, user_id, redirect_uri, code_challenge " +
			"FROM oauth_auth_codes WHERE code_hash = ?1 AND expires_at > ?2",
	)
		.bind(codeHash, Date.now())
		.first<tableOauthAuthCodes>();
	if (!row) return null;
	return {
		id: row.id,
		client_id: row.client_id,
		user_id: row.user_id,
		redirect_uri: row.redirect_uri,
		code_challenge: row.code_challenge,
	};
}

/**
 * Deletes a consumed authorization code. Returns false when no row was
 * removed - which means a concurrent exchange consumed it first (SQLite
 * serializes the deletes, so exactly one caller wins).
 */
export async function deleteAuthCodeById(
	c: AppContext,
	codeId: string,
): Promise<boolean> {
	const res = await c.env.DB.prepare(
		"DELETE FROM oauth_auth_codes WHERE id = ?1",
	)
		.bind(codeId)
		.run();
	return res.meta.changes > 0;
}

/**
 * RFC 6749 / RFC 7591 error response shape - deliberately NOT the
 * `{success,error}` envelope every other endpoint uses; OAuth clients and the
 * spec expect `{ error, error_description? }`.
 */
export function oauthJsonError(
	c: AppContext,
	status: ContentfulStatusCode,
	error: string,
	description?: string,
) {
	return c.json(
		description ? { error, error_description: description } : { error },
		status,
	);
}
