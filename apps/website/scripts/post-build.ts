#!/usr/bin/env node
// vite-ssg writes some routes as flat files (e.g. /docs/ becomes docs.html
// because the static docs/ directory exists). This script normalizes the output
// to directory-style URLs and places the 404 page at /404.html.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "dist");

function ensureDir(filePath: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function move(src: string, dest: string): void {
	ensureDir(dest);
	fs.renameSync(src, dest);
}

function normalize(): void {
	if (!fs.existsSync(DIST)) return;

	// Move dist/docs.html -> dist/docs/index.html so /docs/ resolves correctly.
	const docsFlat = path.join(DIST, "docs.html");
	if (fs.existsSync(docsFlat)) {
		move(docsFlat, path.join(DIST, "docs", "index.html"));
	}

	// Move dist/404/index.html -> dist/404.html so Cloudflare Pages serves it.
	const notFoundDir = path.join(DIST, "404", "index.html");
	if (fs.existsSync(notFoundDir)) {
		move(notFoundDir, path.join(DIST, "404.html"));
		fs.rmdirSync(path.join(DIST, "404"));
	}
}

normalize();
console.log("Post-build route normalization complete.");
