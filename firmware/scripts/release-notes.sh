#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: release-notes.sh <changelog-path> <version> [intro-line]" >&2
  exit 1
fi

changelog="$1"
version="$2"
intro="${3:-}"

if [ ! -f "$changelog" ]; then
  echo "release-notes.sh: changelog not found: $changelog" >&2
  exit 1
fi

heading="## $version"

section="$(awk -v heading="$heading" '
  index($0, heading) == 1 && length($0) == length(heading) { in_section = 1; next }
  /^## / && in_section { exit }
  in_section { if (!seen && /^$/) next; seen = 1; print }
' "$changelog")"

if [ -z "$section" ]; then
  echo "release-notes.sh: no changelog section for \"$heading\" in $changelog" >&2
  exit 1
fi

if [ -n "$intro" ]; then
  printf '%s\n\n' "$intro"
fi
printf '%s\n' "$section"
