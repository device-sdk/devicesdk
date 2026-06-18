#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import matter from "gray-matter";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(__dirname, "../content");
const DOCS_DIR = path.resolve(__dirname, "../../../docs/public");
const OUTPUT_DIR = path.resolve(__dirname, "../public/og-images");
const WIDTH = 1200;
const HEIGHT = 630;

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect x="14" y="12" width="36" height="44" rx="3" fill="#fafafa"/>
  <g fill="#fafafa">
    <rect x="4" y="18" width="10" height="4" rx="1"/><rect x="4" y="30" width="10" height="4" rx="1"/><rect x="4" y="42" width="10" height="4" rx="1"/>
    <rect x="50" y="18" width="10" height="4" rx="1"/><rect x="50" y="30" width="10" height="4" rx="1"/><rect x="50" y="42" width="10" height="4" rx="1"/>
  </g>
  <path d="M26 12 a6 6 0 0 0 12 0 Z" fill="#09090b"/>
  <path d="M26 26 Q22 26 22 30 Q22 34 19 34 Q22 34 22 38 Q22 42 26 42" stroke="#09090b" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M38 26 Q42 26 42 30 Q42 34 45 34 Q42 34 42 38 Q42 42 38 42" stroke="#09090b" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</svg>`;

const posixJoin = (...segments: string[]) =>
	segments.join("/").replace(/\/+/g, "/");

function ogSlugFromRelPath(relPath: string): string {
	const parsed = path.parse(relPath);
	const dir = parsed.dir.replace(/\\/g, "/");
	const name = parsed.name;
	if (name === "_index") {
		if (!dir) return "index";
		return dir;
	}
	return dir ? `${dir}/${name}` : name;
}

function htmlTemplate({ title }: { title: string }): string {
	return `
  <html>
    <head>
      <style>
        @font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; src: local('Inter'); }
        body {
          margin: 0; padding: 0;
          width: ${WIDTH}px; height: ${HEIGHT}px;
          display: flex; align-items: center; justify-content: center;
          background: #09090b; color: #fafafa; font-family: Inter, system-ui, sans-serif;
        }
        .card {
          text-align: center;
          display: flex; flex-direction: column; align-items: center; gap: 18px;
          transform: translateY(-24px);
        }
        .logo-wrap {
          width: 240px; height: 240px;
          border-radius: 16px;
          background: #18181b;
          border: 1px solid #27272a;
          display: grid; place-items: center;
        }
        .logo-wrap svg {
          width: 150px; height: 150px;
        }
        .brand {
          font-size: 64px; font-weight: 780; letter-spacing: 0.65px;
          color: #fafafa;
        }
        .accent {
          color: #10b981;
        }
        .title {
          max-width: 900px;
          font-size: 48px;
          font-weight: 680;
          line-height: 1.22;
          color: #a1a1aa;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo-wrap">${LOGO_SVG}</div>
        <div class="brand">Device<span class="accent">SDK</span></div>
        <div class="title">${title || "Untitled"}</div>
      </div>
    </body>
  </html>`;
}

interface OgTarget {
	rel: string;
	abs: string;
	outPath: string;
	title: string;
}

async function collectTargets(): Promise<OgTarget[]> {
	const contentFiles = await glob("**/*.md", { cwd: CONTENT_DIR, nodir: true });
	const docsFiles = (await glob("**/*.md", { cwd: DOCS_DIR, nodir: true })).map(
		(f) => path.join("docs", f),
	);
	const files = [...contentFiles, ...docsFiles];

	const targets: OgTarget[] = [];
	for (const rel of files) {
		const abs = rel.startsWith("docs/")
			? path.join(DOCS_DIR, rel.slice("docs/".length))
			: path.join(CONTENT_DIR, rel);
		const raw = fs.readFileSync(abs, "utf8");
		const fm = matter(raw);
		const data = fm.data || {};
		let title = (data.title as string) || path.basename(rel, path.extname(rel));
		title = title.replaceAll("DeviceSDK -", "").replaceAll("DeviceSDK", "");

		const ogSlug = ogSlugFromRelPath(rel);
		const outPath = path.join(OUTPUT_DIR, `${ogSlug}.png`);

		if (
			!data.social_image ||
			data.social_image !== `/og-images/${ogSlug}.png`
		) {
			data.social_image = `/og-images/${ogSlug}.png`;
			const updated = matter.stringify(fm.content, data, {
				language: fm.language,
			});
			fs.writeFileSync(abs, updated);
		}

		targets.push({ rel, abs, outPath, title });
	}
	return targets;
}

async function main() {
	const targets = await collectTargets();
	if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({
		viewport: { width: WIDTH, height: HEIGHT },
	});

	for (const target of targets) {
		if (fs.existsSync(target.outPath)) {
			console.log("Skipped (exists)", target.outPath);
			continue;
		}

		const html = htmlTemplate({ title: target.title });
		fs.mkdirSync(path.dirname(target.outPath), { recursive: true });
		await page.setContent(html, { waitUntil: "networkidle" });
		await page.screenshot({ path: target.outPath, fullPage: true });
		console.log("Generated", target.outPath);
	}

	await browser.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
