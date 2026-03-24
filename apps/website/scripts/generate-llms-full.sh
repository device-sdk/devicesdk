#!/usr/bin/env bash
# Generates llms-full.txt by concatenating all documentation Markdown files.
# Run from the repo root: bash apps/website/scripts/generate-llms-full.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
DOCS_DIR="$REPO_ROOT/docs"
OUTPUT="$REPO_ROOT/apps/website/static/llms-full.txt"

cat > "$OUTPUT" << 'HEADER'
# DeviceSDK — Full Documentation

> DeviceSDK is an IoT platform for writing TypeScript scripts that run in the cloud and control ESP32 and Raspberry Pi Pico devices in real time — no embedded C or C++ required.

HEADER

# Find all .md files, excluding _index.md boilerplate
find "$DOCS_DIR" -name '*.md' -not -name '_index.md' | sort | while read -r file; do
    # Extract title from frontmatter (line matching "title: ...")
    title=$(sed -n 's/^title: *"\{0,1\}\([^"]*\)"\{0,1\} *$/\1/p' "$file" | head -1)
    if [ -z "$title" ]; then
        title=$(basename "$file" .md)
    fi

    # Write section header
    echo "## $title"
    echo ""

    # Extract body: everything after the closing --- of frontmatter
    awk 'BEGIN{n=0} /^---$/{n++; if(n==2){skip=1; next}} skip{print}' "$file"
    echo ""
    echo "---"
    echo ""
done >> "$OUTPUT"

echo "Generated $OUTPUT ($(wc -l < "$OUTPUT") lines)"
