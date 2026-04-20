# @devicesdk/dashboard

## 0.1.2

### Patch Changes

- 769f12d: Swap the DeviceSDK logo to the new chip-braces mark (DIP silhouette with `{ }` braces on the die). Three coordinated SVG variants from the brand package are now wired up:
  - **Containerized favicon** (rounded-black square w/ white chip) — serves `apps/website/static/logo.svg` (browser tab, `/api/docs` favicon, OG card source) and `apps/dashboard/public/favicon.svg` (browser tab, in-app header, drawer, login page).
  - **Inverse mark** (white chip, transparent bg) — serves `apps/website/assets/logo.svg`, rendered in the website's dark navbar and footer.
  - **Primary mark** — stored at `.brand/` alongside the full brand spec HTML for future use.

  Also:
  - Inline the OG-card logo SVG directly in `apps/website/generate-og.js` so social-card regeneration no longer fetches `https://devicesdk.com/logo.svg` at build time.
  - Delete 46 stale pre-rendered OG PNGs under `apps/website/static/og-images/` — they regenerate on the next `pnpm build --filter @devicesdk/website` with the new mark.
  - Remove the dead lightning-bolt fallback branch in the website `header.html` / `footer.html` Hugo partials; the logo resource has existed for some time.

## 0.1.1

### Patch Changes

- fe1bad8: Replace stub script templates in the dashboard with working examples covering blink, temperature monitoring, I2C sensor reading, PWM motor control, button LED toggle, and GPIO input monitoring.

## 0.1.0

### Minor Changes

- bc3493a: Add device logging pipeline: console.log/info/warn/error/debug in user device scripts are automatically captured, persisted to per-device storage, served via GET /v1/.../logs endpoint, and displayed in dashboard Logs tab.

  Breaking: removed `LoggerInterface` and `LOGGER` from `UserWorkerEnv` in `@devicesdk/core`. Use `console.log`/`console.info`/etc. instead of `this.env.LOGGER.info()` — logging is now handled transparently via console override.
