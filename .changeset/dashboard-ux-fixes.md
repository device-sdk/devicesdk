---
"@devicesdk/dashboard": minor
---

Dashboard UI/UX, accessibility, and resilience overhaul from a full audit:

- **Error & loading states:** Project and Device detail pages now render a real error state (with Retry / Back) instead of a permanently blank page on a failed load or bad URL; metrics charts distinguish "error" from "no data"; the boot sequence shows a splash instead of a blank white screen.
- **Real error messages:** the API client now throws a typed `ApiError` (distinguishing network failures from auth/HTTP errors), and pages surface the server's actual message ("slug already taken", "limit reached") instead of generic "Failed to …" text. A transient network blip on the auth probe no longer logs the user out.
- **Safer destructive actions:** version rollback now confirms and disables while in flight; delete-account has a loading state; pagination is capped so a bad `has_more` can't wedge a list.
- **Live-stream resilience:** `useDeviceStream` redirects to login on an auth-class WebSocket close (instead of reconnecting forever against a dead session), is revivable after `disconnect()`, and surfaces a "Reconnecting…" indicator.
- **Dark mode:** full dark theme via the existing CSS-variable tokens + Quasar `dark: 'auto'`.
- **Accessibility:** per-route document titles, a skip-to-content link, keyboard-operable table rows, aria-labels on icon-only buttons, chart text alternatives, and re-enabled pinch-zoom.
- **Token dialog:** ported to the design system (works in dark mode) with a copy-before-close safeguard for the one-time secret.
- **Cleanup:** removed the dead axios boot layer (and the `axios` dependency), the unused IndexPage stub, a redundant project-edit dialog, and a permanently-empty stat; restyled the 404 page to match the app; added per-route titles; race-guarded detail fetches with `AbortController`.
