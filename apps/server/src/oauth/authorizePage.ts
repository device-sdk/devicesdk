import { getCookie, setCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import type { AppContext } from "../types";
import { getClient, insertAuthCode, type OauthClient } from "./store";

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function renderPage(title: string, content: string) {
	return html`<!doctype html>
		<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>${raw(title)} - DeviceSDK</title>
				<style>
					* {
						box-sizing: border-box;
						margin: 0;
						padding: 0;
					}
					body {
						font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
							Oxygen, Ubuntu, sans-serif;
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
						min-height: 100vh;
						display: flex;
						align-items: center;
						justify-content: center;
						padding: 20px;
					}
					.card {
						background: white;
						border-radius: 16px;
						padding: 40px;
						max-width: 440px;
						width: 100%;
						box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
					}
					h1 {
						color: #1a202c;
						font-size: 22px;
						margin-bottom: 8px;
						text-align: center;
					}
					.subtitle {
						color: #4a5568;
						text-align: center;
						margin-bottom: 24px;
						line-height: 1.5;
					}
					.note {
						background: #f7fafc;
						border-left: 4px solid #667eea;
						padding: 12px 16px;
						margin-bottom: 24px;
						border-radius: 0 8px 8px 0;
						font-size: 14px;
						color: #4a5568;
						line-height: 1.5;
					}
					.actions {
						display: flex;
						gap: 12px;
					}
					button {
						flex: 1;
						padding: 14px 24px;
						border-radius: 8px;
						font-size: 16px;
						font-weight: 600;
						cursor: pointer;
						transition: all 0.2s;
						border: none;
					}
					.btn-approve {
						background: #667eea;
						color: white;
					}
					.btn-approve:hover {
						background: #5a67d8;
					}
					.btn-deny {
						background: #f7fafc;
						color: #4a5568;
						border: 2px solid #e2e8f0;
					}
					.btn-deny:hover {
						background: #edf2f7;
					}
					.error {
						color: #dc2626;
						text-align: center;
					}
					.error-icon {
						font-size: 48px;
						margin-bottom: 16px;
					}
				</style>
			</head>
			<body>
				<div class="card">${raw(content)}</div>
			</body>
		</html>`;
}

function renderErrorPage(message: string) {
	return renderPage(
		"Error",
		`
    <div class="error">
      <div class="error-icon">✕</div>
      <h1>Error</h1>
      <p class="subtitle">${escapeHtml(message)}</p>
    </div>
  `,
	);
}

interface ConsentFields {
	responseType: string;
	clientId: string;
	redirectUri: string;
	codeChallenge: string;
	codeChallengeMethod: string;
	state: string | undefined;
}

function hiddenField(name: string, value: string): string {
	return `<input type="hidden" name="${name}" value="${escapeHtml(value)}" />`;
}

function renderConsentPage(
	client: OauthClient,
	userEmail: string,
	csrfToken: string,
	fields: ConsentFields,
) {
	const hidden = [
		hiddenField("response_type", fields.responseType),
		hiddenField("client_id", fields.clientId),
		hiddenField("redirect_uri", fields.redirectUri),
		hiddenField("code_challenge", fields.codeChallenge),
		hiddenField("code_challenge_method", fields.codeChallengeMethod),
		fields.state !== undefined ? hiddenField("state", fields.state) : "",
		hiddenField("csrf_token", csrfToken),
	].join("\n");

	return renderPage(
		"Authorize",
		`
    <h1>Authorize ${escapeHtml(client.client_name)}</h1>
    <p class="subtitle"><strong>${escapeHtml(client.client_name)}</strong> wants to access your
      DeviceSDK server as <strong>${escapeHtml(userEmail)}</strong>.</p>

    <div class="note">
      Approving creates an API token you can revoke anytime in the dashboard's
      Tokens page. It expires automatically after 30 days.
    </div>

    <form method="POST" action="/oauth/authorize">
      ${hidden}
      <div class="actions">
        <button type="submit" name="action" value="deny" class="btn-deny">Deny</button>
        <button type="submit" name="action" value="approve" class="btn-approve">Approve</button>
      </div>
    </form>
  `,
	);
}

interface ValidAuthorize extends ConsentFields {
	kind: "valid";
	client: OauthClient;
}
interface ClientError {
	kind: "client_error";
}
interface RedirectableError {
	kind: "redirect_error";
	redirectUri: string;
	state: string | undefined;
	error: string;
}
type AuthorizeValidation = ValidAuthorize | ClientError | RedirectableError;

/**
 * Validates an /oauth/authorize request (shared by GET and POST - POST
 * re-validates every field rather than trusting the hidden form fields
 * blindly). Client/redirect_uri mismatches are NOT redirectable (per OAuth
 * security BCP - we cannot trust an unregistered redirect target); every
 * other validation failure redirects back to the now-trusted redirect_uri
 * with `?error=`.
 */
async function validateAuthorizeRequest(
	c: AppContext,
	params: Record<string, string | undefined>,
): Promise<AuthorizeValidation> {
	const clientId = params.client_id;
	const redirectUri = params.redirect_uri;
	const state = params.state || undefined;

	if (!clientId || !redirectUri) return { kind: "client_error" };
	const client = await getClient(c, clientId);
	if (!client) return { kind: "client_error" };
	if (!client.redirect_uris.includes(redirectUri))
		return { kind: "client_error" };

	if (params.response_type !== "code") {
		return {
			kind: "redirect_error",
			redirectUri,
			state,
			error: "unsupported_response_type",
		};
	}
	if (params.code_challenge_method !== "S256") {
		return {
			kind: "redirect_error",
			redirectUri,
			state,
			error: "invalid_request",
		};
	}
	const codeChallenge = params.code_challenge ?? "";
	if (codeChallenge.length < 43 || codeChallenge.length > 128) {
		return {
			kind: "redirect_error",
			redirectUri,
			state,
			error: "invalid_request",
		};
	}

	return {
		kind: "valid",
		client,
		responseType: "code",
		clientId,
		redirectUri,
		codeChallenge,
		codeChallengeMethod: "S256",
		state,
	};
}

function redirectWithError(c: AppContext, err: RedirectableError) {
	const url = new URL(err.redirectUri);
	url.searchParams.set("error", err.error);
	if (err.state !== undefined) url.searchParams.set("state", err.state);
	return c.redirect(url.toString());
}

const CSRF_COOKIE_NAME = "oauth_csrf";

/** GET /oauth/authorize - mounted behind cliAuthUser (redirects to login if unauthenticated). */
export async function getAuthorizePage(c: AppContext) {
	const user = c.get("user");
	const validation = await validateAuthorizeRequest(c, c.req.query());

	if (validation.kind === "client_error") {
		return c.html(
			renderErrorPage(
				"This request could not be verified (unknown client_id or an unregistered redirect_uri). Contact the application's developer.",
			),
			400,
		);
	}
	if (validation.kind === "redirect_error") {
		return redirectWithError(c, validation);
	}

	const csrfToken = crypto.randomUUID();
	setCookie(c, CSRF_COOKIE_NAME, csrfToken, {
		path: "/oauth/authorize",
		httpOnly: true,
		sameSite: "Strict",
		secure: c.env.ENV !== "local",
		maxAge: 600,
	});

	return c.html(
		renderConsentPage(validation.client, user.email, csrfToken, validation),
	);
}

/** POST /oauth/authorize - mounted behind cliAuthUser; approve/deny the consent form. */
export async function postAuthorizeAction(c: AppContext) {
	const user = c.get("user");
	const formData = await c.req.parseBody();
	const field = (key: string): string | undefined => {
		const value = formData[key];
		return typeof value === "string" ? value : undefined;
	};

	const csrfFromForm = field("csrf_token");
	const csrfFromCookie = getCookie(c, CSRF_COOKIE_NAME);
	if (!csrfFromForm || !csrfFromCookie || csrfFromForm !== csrfFromCookie) {
		return c.html(renderErrorPage("Invalid request. Please try again."), 403);
	}

	const validation = await validateAuthorizeRequest(c, {
		response_type: field("response_type"),
		client_id: field("client_id"),
		redirect_uri: field("redirect_uri"),
		code_challenge: field("code_challenge"),
		code_challenge_method: field("code_challenge_method"),
		state: field("state"),
	});

	if (validation.kind === "client_error") {
		return c.html(
			renderErrorPage(
				"This request could not be verified. Please restart the authorization flow.",
			),
			400,
		);
	}
	if (validation.kind === "redirect_error") {
		return redirectWithError(c, validation);
	}

	if (field("action") !== "approve") {
		return redirectWithError(c, {
			kind: "redirect_error",
			redirectUri: validation.redirectUri,
			state: validation.state,
			error: "access_denied",
		});
	}

	const code = await insertAuthCode(c, {
		clientId: validation.clientId,
		userId: user.id,
		redirectUri: validation.redirectUri,
		codeChallenge: validation.codeChallenge,
	});

	const url = new URL(validation.redirectUri);
	url.searchParams.set("code", code);
	if (validation.state !== undefined)
		url.searchParams.set("state", validation.state);
	return c.redirect(url.toString());
}
