import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const BASE = "static/.well-known/agent-skills";
const SITE = process.env.SITE_URL || "https://devicesdk.com";

// Single-line YAML only: each frontmatter line must be `key: value`.
// Multi-line, quoted-with-newlines, and list values are not supported —
// keep SKILL.md frontmatter to plain `name:` and `description:` lines.
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((l) => l.match(/^(\w+):\s*(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );
}

const skills = readdirSync(BASE, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((d) => {
    const path = join(BASE, d.name, "SKILL.md");
    const content = readFileSync(path);
    const fm = parseFrontmatter(content.toString());
    return {
      name: fm.name || d.name,
      type: "skill-md",
      description: fm.description || "",
      url: `${SITE}/.well-known/agent-skills/${d.name}/SKILL.md`,
      digest: "sha256:" + createHash("sha256").update(content).digest("hex"),
    };
  });

const index = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills,
};

writeFileSync(
  join(BASE, "index.json"),
  JSON.stringify(index, null, 2) + "\n",
);
console.log(`Wrote ${skills.length} skill entries to ${BASE}/index.json`);
