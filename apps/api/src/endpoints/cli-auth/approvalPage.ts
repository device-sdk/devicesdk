import type { AppContext } from "../../types";
import { html, raw } from "hono/html";

type CliAuthCode = {
	id: string;
	device_code: string;
	user_code: string;
	user_id: string | null;
	status: string;
	created_at: number;
	expires_at: number;
};

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
						max-width: 420px;
						width: 100%;
						box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
					}
					h1 {
						color: #1a202c;
						font-size: 24px;
						margin-bottom: 8px;
						text-align: center;
					}
					.subtitle {
						color: #718096;
						text-align: center;
						margin-bottom: 32px;
					}
					.code-display {
						background: #f7fafc;
						border: 2px dashed #e2e8f0;
						border-radius: 12px;
						padding: 20px;
						text-align: center;
						margin-bottom: 24px;
					}
					.code-label {
						color: #718096;
						font-size: 14px;
						margin-bottom: 8px;
					}
					.code-value {
						font-family: "SF Mono", Monaco, monospace;
						font-size: 32px;
						font-weight: 700;
						color: #667eea;
						letter-spacing: 4px;
					}
					.warning {
						background: #fffbeb;
						border-left: 4px solid #f59e0b;
						padding: 12px 16px;
						margin-bottom: 24px;
						border-radius: 0 8px 8px 0;
						font-size: 14px;
						color: #92400e;
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
					.success {
						color: #059669;
						text-align: center;
					}
					.success-icon {
						font-size: 48px;
						margin-bottom: 16px;
					}
					.error {
						color: #dc2626;
						text-align: center;
					}
					.error-icon {
						font-size: 48px;
						margin-bottom: 16px;
					}
					input[type="text"] {
						width: 100%;
						padding: 14px 16px;
						border: 2px solid #e2e8f0;
						border-radius: 8px;
						font-size: 18px;
						font-family: "SF Mono", Monaco, monospace;
						text-align: center;
						letter-spacing: 2px;
						margin-bottom: 16px;
						text-transform: uppercase;
					}
					input[type="text"]:focus {
						outline: none;
						border-color: #667eea;
					}
				</style>
			</head>
			<body>
				<div class="card">${raw(content)}</div>
			</body>
		</html>`;
}

function renderCodeEntryPage() {
	return renderPage(
		"CLI Login",
		`
    <h1>DeviceSDK CLI Login</h1>
    <p class="subtitle">Enter the code shown in your terminal</p>
    <form method="GET" action="/cli/auth">
      <input type="text" name="code" placeholder="XXXX-0000" maxlength="9" required autocomplete="off" autofocus />
      <div class="actions">
        <button type="submit" class="btn-approve">Continue</button>
      </div>
    </form>
  `,
	);
}

function renderApprovalPage(userCode: string) {
	return renderPage(
		"Approve CLI Login",
		`
    <h1>DeviceSDK CLI Login</h1>
    <p class="subtitle">A CLI tool is requesting access to your account</p>
    
    <div class="code-display">
      <div class="code-label">Verification Code</div>
      <div class="code-value">${userCode}</div>
    </div>
    
    <div class="warning">
      Make sure this matches the code shown in your terminal before approving.
    </div>
    
    <form method="POST" action="/cli/auth">
      <input type="hidden" name="code" value="${userCode}" />
      <div class="actions">
        <button type="submit" name="action" value="deny" class="btn-deny">Deny</button>
        <button type="submit" name="action" value="approve" class="btn-approve">Approve</button>
      </div>
    </form>
  `,
	);
}

function renderSuccessPage(message: string) {
	return renderPage(
		"Success",
		`
    <div class="success">
      <div class="success-icon">✓</div>
      <h1>Success</h1>
      <p class="subtitle">${message}</p>
    </div>
  `,
	);
}

function renderErrorPage(message: string) {
	return renderPage(
		"Error",
		`
    <div class="error">
      <div class="error-icon">✕</div>
      <h1>Error</h1>
      <p class="subtitle">${message}</p>
    </div>
  `,
	);
}

export async function getApprovalPage(c: AppContext) {
	const code = c.req.query("code");
	const user = c.get("user");

	if (!code) {
		return c.html(renderCodeEntryPage());
	}

	const authCode = await c.env.DB.prepare(
		"SELECT * FROM cli_auth_codes WHERE user_code = ? AND status = ?",
	)
		.bind(code.toUpperCase(), "pending")
		.first<CliAuthCode>();

	if (!authCode || authCode.expires_at < Date.now()) {
		return c.html(renderErrorPage("Invalid or expired code"));
	}

	return c.html(renderApprovalPage(code.toUpperCase()));
}

export async function handleApproval(c: AppContext) {
	const formData = await c.req.parseBody();
	const code = formData.code as string;
	const action = formData.action as string;
	const user = c.get("user");

	if (!code) {
		return c.html(renderErrorPage("Code is required"));
	}

	const authCode = await c.env.DB.prepare(
		"SELECT * FROM cli_auth_codes WHERE user_code = ? AND status = ?",
	)
		.bind(code.toUpperCase(), "pending")
		.first<CliAuthCode>();

	if (!authCode || authCode.expires_at < Date.now()) {
		return c.html(renderErrorPage("Invalid or expired code"));
	}

	const newStatus = action === "approve" ? "approved" : "denied";

	await c.env.DB.prepare(
		"UPDATE cli_auth_codes SET status = ?, user_id = ? WHERE id = ?",
	)
		.bind(newStatus, action === "approve" ? user.id : null, authCode.id)
		.run();

	if (action === "approve") {
		return c.html(
			renderSuccessPage("CLI login approved. You can close this window."),
		);
	}
	return c.html(renderSuccessPage("CLI login denied."));
}
