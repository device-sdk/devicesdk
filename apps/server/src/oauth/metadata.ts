import type { AppContext } from "../types";

function originOf(c: AppContext): string {
	return new URL(c.req.url).origin;
}

/**
 * RFC 9728 OAuth protected resource metadata. Unauthenticated, so a 401 from
 * /mcp (see foundation/auth.ts's mcpAuth) can point clients here via
 * WWW-Authenticate to bootstrap OAuth discovery.
 */
export function protectedResourceMetadata(c: AppContext) {
	const origin = originOf(c);
	return c.json({
		resource: `${origin}/mcp`,
		authorization_servers: [origin],
		bearer_methods_supported: ["header"],
	});
}

/**
 * RFC 8414 OAuth authorization server metadata. The issuer and every endpoint
 * URL are derived from the incoming request so this works unmodified for
 * devicesdk.local, a bare LAN IP, or a reverse-proxied hostname.
 */
export function authorizationServerMetadata(c: AppContext) {
	const origin = originOf(c);
	return c.json({
		issuer: origin,
		authorization_endpoint: `${origin}/oauth/authorize`,
		token_endpoint: `${origin}/oauth/token`,
		registration_endpoint: `${origin}/oauth/register`,
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code"],
		code_challenge_methods_supported: ["S256"],
		token_endpoint_auth_methods_supported: ["none"],
	});
}
