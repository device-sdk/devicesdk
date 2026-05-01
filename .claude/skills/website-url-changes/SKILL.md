---
name: website-url-changes
description: Use whenever a change will alter the public URL of a page on devicesdk.com. Triggers include renaming/moving/deleting any file under apps/website/content/ or docs/public/ (which mounts at /docs/), changing `permalink` or `url` in a content file's front-matter, modifying `[permalinks]` in apps/website/hugo.toml, or changing `[[module.mounts]]` targets. Ensures a 301 entry is added to apps/website/static/_redirects so the old URL keeps its Google index signal.
---

# Website URL changes

Any change that alters a public URL on devicesdk.com requires a 301 redirect from the old URL to the new one. Google retains old URLs in its index for months — without a redirect, those URLs go to 404 (or to a "duplicate without canonical" status) and the impressions they were earning are lost.

## When this applies

- Renaming a `.md` file under `apps/website/content/` or `docs/public/`.
- Moving a file between directories (e.g., `docs/public/resources/hardware/esp32.md` → `docs/public/hardware/esp32.md`).
- Deleting a file that has been live long enough for Google to know about it.
- Changing `slug:`, `url:`, or `permalink:` in a content file's front-matter.
- Editing `[permalinks]` in `apps/website/hugo.toml`.
- Editing `[[module.mounts]]` `target` for content sources, which shifts where content lands in the URL tree.

## What to do

1. **Identify the old URL.** Hugo's permalink derivation:
   - `content/foo/bar.md` → `/foo/bar/`
   - `content/foo/_index.md` → `/foo/`
   - `docs/public/cli/init.md` → `/docs/cli/init/` (because the `docs/public/` mount target is `content/docs`)
   - Front-matter `slug:` overrides the filename.
   - Front-matter `url:` overrides the entire path.

2. **Identify the new URL.** Same rules, applied to the post-change file location/front-matter.

3. **Add an entry to `apps/website/static/_redirects`** with format `<old> <new> 301`, one per line:

   ```
   /docs/old-path/                      /docs/new-path/                301
   /docs/old-section/:slug              /docs/new-section/:slug        301
   ```

   Use `:slug` wildcards when an entire subtree moved. Place specific entries before general ones (Cloudflare matches top-down).

4. **For deletions**, redirect to the closest still-existing parent or the most relevant remaining page — never leave a 404 if the page had any inbound links. Example: deleted `/docs/guides/control-from-browser/` → 301 to `/docs/guides/`.

5. **Verify after deploy:**

   ```
   curl -I https://devicesdk.com/<old-url>
   ```

   Expect `HTTP/2 301` with a `location:` header pointing to the new URL.

## Worked example: hardware docs migration

Before this rule existed, hardware docs were moved from `docs/public/resources/hardware/*` to `docs/public/hardware/*`. Search Console kept showing impressions on the old `/docs/resources/hardware/` URL (~36/quarter) and flagged it as "duplicate without canonical". The fix added to `_redirects`:

```
/docs/resources/hardware/         /docs/hardware/        301
/docs/resources/hardware/:slug    /docs/hardware/:slug   301
```

The first line covers the section landing; the second covers all child pages (`esp32.md`, `pico-w.md`, etc.).

## Why not just rely on Hugo aliases?

Hugo's built-in `aliases:` front-matter creates HTML meta-refresh redirects in the *new* page's location. Those work for users but Google treats them as soft 301s at best and ignores them at worst. A real `_redirects` 301 served by Cloudflare's edge is what transfers index signal cleanly.

## Skip when

- The change is to a file that has never been deployed (e.g., a new draft).
- The change only touches the body of a file, not its URL.
- The file is under `docs/internal/` (not mounted into the public site).
