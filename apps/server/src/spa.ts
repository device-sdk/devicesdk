import { resolve, sep } from "node:path";
import type { AppContext } from "./types";

/**
 * Serves the built dashboard SPA from config.publicDir with an index.html
 * fallback for client-side routes. API paths never reach this handler (it
 * is mounted last). Disabled when publicDir is unset (dev mode - dashboard
 * runs on the quasar dev server instead).
 */
export async function serveSpa(c: AppContext): Promise<Response> {
	const publicDir = c.env.config.publicDir;
	if (!publicDir) {
		return c.json(
			{
				success: false,
				error:
					"Not found. (Dashboard serving is disabled: PUBLIC_DIR is not set.)",
			},
			404,
		);
	}

	const root = resolve(publicDir);
	const pathname = decodeURIComponent(new URL(c.req.url).pathname);
	const candidate = resolve(root, `.${pathname}`);

	// Path traversal guard
	if (candidate === root || candidate.startsWith(root + sep)) {
		const file = Bun.file(candidate);
		if (await file.exists()) {
			return new Response(file);
		}
	}

	const index = Bun.file(resolve(root, "index.html"));
	if (await index.exists()) {
		return new Response(index, {
			headers: { "Content-Type": "text/html; charset=utf-8" },
		});
	}
	return c.json({ success: false, error: "Not found" }, 404);
}
