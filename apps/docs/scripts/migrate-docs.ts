#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

const SOURCE_DIR = new URL("../../../docs/public", import.meta.url).pathname;
const DEST_DIR = new URL("../src/content/docs", import.meta.url).pathname;

const SECTION_INDEX_ORDER: Record<string, number> = {
  index: 0,
  quickstart: 1,
  "first-device": 2,
  cli: 3,
  concepts: 4,
  guides: 5,
  recipes: 6,
  hardware: 7,
  mcp: 8,
  errors: 9,
  changelog: 10,
  resources: 11,
};

const HIDDEN_PAGES = new Set(["ROADMAP.md"]);

function escapeYamlValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes("\n") || s.includes("\r")) {
    return JSON.stringify(s);
  }
  if (s === "" || s.includes(":") || s.includes("#") || s.startsWith("'")) {
    return JSON.stringify(s);
  }
  return s;
}

function inferTitle(text: string): string {
  const h1 = text.match(/^# (.+)$/m);
  if (h1) return h1[1].trim();
  return "";
}

function rewriteFrontmatter(text: string, relativePath: string): string {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return text;

  const data = yaml.parse(match[1]);
  const body = text.slice(match[0].length);

  let title = data.title;
  if (!title) {
    title = inferTitle(body);
  }

  const description = data.description;
  const weight = data.weight;

  const fileSlug = path.basename(relativePath, ".md");
  const slug = fileSlug === "_index" ? "index" : fileSlug;
  const dir = path.dirname(relativePath);
  const topLevel = dir === "." ? slug : dir.split("/")[0];
  const isSectionIndex = slug === "index";
  const isTopLevel = dir === ".";

  let sidebarOrder;
  if (isSectionIndex) {
    sidebarOrder = 0;
  } else if (weight !== undefined) {
    sidebarOrder = weight;
  } else if (isTopLevel) {
    sidebarOrder = SECTION_INDEX_ORDER[topLevel] ?? 999;
  } else {
    sidebarOrder = 999;
  }

  const lines = [];
  lines.push(`title: ${escapeYamlValue(title)}`);
  if (description !== undefined && description !== "") {
    lines.push(`description: ${escapeYamlValue(description)}`);
  }
  lines.push(`sidebar:`);
  lines.push(`  order: ${sidebarOrder}`);
  if (HIDDEN_PAGES.has(relativePath)) {
    lines.push(`  hidden: true`);
  }

  return `---\n${lines.join("\n")}\n---\n${body}`;
}

function rewriteBody(text: string): string {
  // Rewrite markdown link targets from /docs/X to /X.
  text = text.replace(/\]\(\/docs\//g, "](/");
  // Rewrite absolute devicesdk.com/docs links to root-relative paths on the docs subdomain.
  text = text.replace(/https:\/\/devicesdk\.com\/docs\//g, "/");
  // Rewrite inline-code path references (`/docs/foo/` -> `/foo/`).
  text = text.replace(/`\/?docs\/([^`]+)`/g, "`/$1`");
  return text;
}

function copyDocs(dir: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const src = path.join(dir, entry.name);
    const rel = path.relative(SOURCE_DIR, src);
    const outName = entry.name === "_index.md" ? "index.md" : entry.name;
    const outPath = path.join(dest, outName);

    if (entry.isDirectory()) {
      copyDocs(src, outPath);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      let text = fs.readFileSync(src, "utf-8");
      text = rewriteFrontmatter(text, rel);
      text = rewriteBody(text);
      fs.writeFileSync(outPath, text);
    }
  }
}

fs.rmSync(DEST_DIR, { recursive: true, force: true });
copyDocs(SOURCE_DIR, DEST_DIR);
console.log(`Migrated docs from ${SOURCE_DIR} to ${DEST_DIR}`);
