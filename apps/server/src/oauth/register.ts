import { z } from "zod";
import type { AppContext } from "../types";
import { insertClient, oauthJsonError } from "./store";

const RegisterSchema = z.object({
	client_name: z.string().max(100).optional(),
	redirect_uris: z.array(z.string()).min(1),
});

/**
 * Every scheme is accepted as long as it parses as an absolute URI: `https`
 * (recommended), `http` (including non-loopback hosts - this is a LAN
 * self-host product where the MCP client's own host may itself be a
 * non-TLS box on the network, not just localhost), or a custom scheme like
 * `cursor://` for native-app redirect handlers. There is no allowlist of
 * hosts; DCR is inherently "trust on first use" for a single-user-grade
 * self-hosted server, and the rate limiter on this route bounds abuse.
 */
function isValidRedirectUri(raw: string): boolean {
	try {
		const url = new URL(raw);
		return url.protocol.length > 1;
	} catch {
		return false;
	}
}

/** POST /oauth/register - RFC 7591 dynamic client registration. */
export async function handleRegisterClient(c: AppContext) {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return oauthJsonError(
			c,
			400,
			"invalid_client_metadata",
			"Request body must be JSON.",
		);
	}

	const parsed = RegisterSchema.safeParse(body);
	if (!parsed.success) {
		return oauthJsonError(
			c,
			400,
			"invalid_client_metadata",
			"redirect_uris (non-empty array of strings) is required.",
		);
	}

	const { redirect_uris } = parsed.data;
	if (!redirect_uris.every(isValidRedirectUri)) {
		return oauthJsonError(
			c,
			400,
			"invalid_client_metadata",
			"Every redirect_uri must be an absolute URI.",
		);
	}

	const clientName = parsed.data.client_name?.trim() || "MCP client";
	const client = await insertClient(c, {
		clientName,
		redirectUris: redirect_uris,
	});

	return c.json(
		{
			client_id: client.id,
			client_name: client.client_name,
			redirect_uris: client.redirect_uris,
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code"],
			response_types: ["code"],
		},
		201,
	);
}
