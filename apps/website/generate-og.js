#!/usr/bin/env node
// Requires: npm i gray-matter glob playwright
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { chromium } from 'playwright';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTENT_DIR = path.join(__dirname, 'content');
const OUTPUT_DIR = path.join(__dirname, 'static', 'og-images');
const WIDTH = 1200;
const HEIGHT = 630;

// Inline inverse mark (white chip, black braces) — renders on the dark OG card
// without a network fetch. Sourced from the brand package, section 02 "Horizontal · dark".
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

const posixJoin = (...segments) => segments.join('/').replace(/\/+/g, '/');

function ogSlugFromRelPath(relPath) {
  // relPath like docs/quickstart.md or docs/_index.md
  const parsed = path.parse(relPath);
  const dir = parsed.dir.replace(/\\/g, '/');
  const name = parsed.name;
  if (name === '_index') {
    if (!dir) return 'index';
    return dir;
  }
  return dir ? `${dir}/${name}` : name;
}

function htmlTemplate({ title }) {
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
        <div class="title">${title || 'Untitled'}</div>
      </div>
    </body>
  </html>`;
}

const DOCS_DIR = path.join(__dirname, '..', '..', 'docs');

async function main() {
  const contentFiles = await glob('**/*.md', { cwd: CONTENT_DIR, nodir: true });
  const docsFiles = (await glob('**/*.md', { cwd: DOCS_DIR, nodir: true }))
    .map(f => path.join('docs', f));
  const files = [...contentFiles, ...docsFiles];
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  for (const rel of files) {
    const abs = rel.startsWith('docs/')
      ? path.join(DOCS_DIR, rel.slice('docs/'.length))
      : path.join(CONTENT_DIR, rel);
    const raw = fs.readFileSync(abs, 'utf8');
    const fm = matter(raw);
    const data = fm.data || {};
    let title = data.title || path.basename(rel, path.extname(rel));
    title = title.replaceAll('DeviceSDK -', '').replaceAll('DeviceSDK', '');

    const ogSlug = ogSlugFromRelPath(rel);
    const ogRelPath = `/${posixJoin('og-images', `${ogSlug}.png`)}`;
    const outPath = path.join(OUTPUT_DIR, `${ogSlug}.png`);

    if (!data.social_image || data.social_image !== ogRelPath) {
      data.social_image = ogRelPath;
      const updated = matter.stringify(fm.content, data, { language: fm.language, delimiters: fm.delimiters });
      fs.writeFileSync(abs, updated);
    }

    if (fs.existsSync(outPath)) {
      console.log('Skipped (exists)', outPath);
      continue;
    }

    const html = htmlTemplate({ title });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.screenshot({ path: outPath, fullPage: true });
    console.log('Generated', outPath);
  }

  await browser.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
