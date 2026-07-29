---
name: website-url-changes
description: Use whenever a change will alter the public URL of a page on devicesdk.com. Triggers include renaming/moving/deleting any file under apps/website/content/, changing `slug:` or `url:` in a content file's front-matter, or changing the route derivation in apps/website/scripts/build-content.ts. Ensures a 301 entry is added to apps/website/static/_redirects so the old URL keeps its Google index signal.
---

# Website URL changes

Any change that alters a public URL on devicesdk.com requires a 301 redirect from the old URL to the new one. Google retains old URLs in its index for months - without a redirect, those URLs go to 404 (or to a "duplicate without canonical" status) and the impressions they were earning are lost.

## When this applies

- Renaming a `.md` file under `apps/website/content/`.
- Moving a file between directories (e.g., `apps/website/content/about/team.md` → `apps/website/content/company/team.md`).
- Deleting a file that has been live long enough for Google to know about it.
- Changing `slug:` or `url:` in a content file's front-matter.
- Editing the route derivation in `apps/website/scripts/build-content.ts` (e.g. how filenames map to paths or trailing-slash behavior).

## What to do

1. **Identify the old URL.** The build script's permalink derivation:
   - `content/foo/bar.md` → `/foo/bar/`
   - `content/foo/_index.md` → `/foo/`
   - Front-matter `slug:` overrides the filename.
   - Front-matter `url:` overrides the entire path.

2. **Identify the new URL.** Same rules, applied to the post-change file location/front-matter.

3. **Add an entry to `apps/website/static/_redirects`** with format `<old> <new> 301`, one per line:

   ```
   /old-path/                      /new-path/                301
   /old-section/:slug              /new-section/:slug        301
   ```

   Use `:slug` wildcards when an entire subtree moved. Place specific entries before general ones (Cloudflare matches top-down).

4. **For deletions**, redirect to the closest still-existing parent or the most relevant remaining page - never leave a 404 if the page had any inbound links. Example: deleted `/about/team/` → 301 to `/about/`.

5. **Verify after deploy:**

   ```
   curl -I https://devicesdk.com/<old-url>
   ```

   Expect `HTTP/2 301` with a `location:` header pointing to the new URL.

## Worked example: marketing page migration

Before this rule existed, a marketing page was moved from `/company/team/` to `/about/team/`. Search Console kept showing impressions on the old URL (~36/quarter) and flagged it as "duplicate without canonical". The fix added to `_redirects`:

```
/company/team/         /about/team/        301
```

The redirect transfers index signal to the new URL for both the section landing and any child pages.

## Why not rely on client-side redirects?

The site is a static SSG build. A real `_redirects` 301 served by Cloudflare's edge transfers index signal cleanly and works for all clients, including search crawlers and `curl`. Client-side `<meta http-equiv="refresh">` or Vue-router redirects are invisible to crawlers and should not be used for SEO-sensitive URL moves.

## Skip when

- The change is to a file that has never been deployed (e.g., a new draft).
- The change only touches the body of a file, not its URL.
- The file is under `apps/docs/src/content/docs/` (the docs subdomain, not the marketing site).
