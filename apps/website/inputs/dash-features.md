# DeviceSDK Dashboard — Marketing Feature Inventory

## Product snapshot
- **What it is:** Quasar/Vue dashboard for DeviceSDK to manage IoT projects, devices, scripts, and API tokens with Google OAuth.
- **Who it’s for:** Teams building/operating fleets of connected devices who want CLI-first workflows plus a friendly control panel.
- **How it works:** Browser UI backed by DeviceSDK API (`https://api.devicesdk.com` prod, `http://localhost:8787` dev) with cookie-based auth; deployable to Cloudflare Workers (SPA) from `dist/spa/`.

## Core value pillars
1) **Unified fleet control:** Projects, devices, scripts, and versions in one place.  
2) **Safe collaboration:** OAuth login, token scoping, delete confirmations, and destructive “danger zone” patterns.  
3) **CLI + UI harmony:** UI reinforces CLI-first flows (e.g., project/device creation guidance via CLI while still enabling UI CRUD).  
4) **Fast feedback:** Inline toasts, loading/skeleton states, and optimistic refresh after mutations.  
5) **Future-ready:** Tabs/placeholders for logs, preferences, and advanced monitoring.

## Top-level features (current UI)
- **Authentication:** Google OAuth 2.0 login (`Sign in with Google`), session via HTTP-only cookie; logout from user menu. @src/pages/LoginPage.vue#1-200 @src/stores/auth.ts#1-54  
- **Navigation:** Main layout with header (avatar, notifications, user menu) and sidebar links for Projects, API Tokens, Account. @src/layouts/MainLayout.vue#1-262  
- **Projects hub:** Table with search/filter, device counts, created date, contextual actions, empty/loading states, create project dialog, delete confirmation. @src/pages/ProjectsPage.vue#1-376  
- **Project detail:** Tabs (Overview, Devices, Settings), stats cards, quick actions, device table, edit/delete project flows, inline form for name/description. @src/pages/ProjectDetailsPage.vue#1-428  
- **Devices detail:** Tabs (Overview, Script, Versions, Logs, Settings); script upload with size guard; template dropdown; version history with deploy/rollback; device edit/delete; online/offline chip; “Logs” marked coming soon. @src/pages/DeviceDetailsPage.vue#1-694  
- **API Tokens:** Table of tokens with managed/user chip, last-four display, create token dialog (one-time reveal), delete confirmation, empty/loading states. @src/pages/TokensPage.vue#1-322  
- **Account:** Profile card (name, email, picture, verified badge, member since), future preferences placeholder, account delete placeholder. @src/pages/AccountPage.vue#1-169  
- **Legal:** Terms of Service page linked from login. @src/pages/TermsPage.vue#1-263  
- **Error:** 404 fallback with return home CTA. @src/pages/ErrorNotFound.vue#1-24  

## Device & script capabilities
- Device records: slug, name, description, status (online inferred from last_connected_at), timestamps.  
- Script management per device: upload JS/TS script, optional deploy message, 1 MB size limit indicator, template presets (Blink, Temperature Monitor, I2C Reader, PWM Motor Control, Button LED Toggle, GPIO Monitor), version history fetch/view, deploy previous version, view code modal.  
- Quick online check: treats devices active if seen within last 5 minutes.  

## API coverage (frontend services)
- **User:** `GET /v1/user/me`, `POST /v1/auth/logout`.  
- **Projects:** list/create/update/delete; fetch single with devices.  
- **Devices:** list/create/update/delete per project.  
- **Scripts:** get current, upload new, list versions, get version detail, deploy version.  
- **Tokens:** list/create/delete; creation returns token once.  
- All calls include credentials; environment-aware base URL set in `src/lib/api.ts` & axios boot. @src/services/api.service.ts#1-396

## UX polish & safety
- Consistent modern cards/tables, breadcrumbs, chips, skeleton/progress loaders, toasts on success/error, empty states with CTAs.  
- Destructive flows gated by confirmations and “danger zone” sections for projects/devices/account.  
- Search/filter on projects; pagination controls on tables.  
- Responsive layouts (Quasar grid); sidebar collapsible via header menu button.

## Auth & session story
- Google OAuth client id baked in; redirects to backend `/v1/auth/google`, session via `devicesdk-session` HTTP-only cookie.  
- Frontend guard: Pinia auth store + router guard redirecting unauthenticated users to `/login`; prevents accessing login when already authenticated. @src/router/index.ts#1-54  
- Redirect passthrough: optional `redirect_uri` persisted in sessionStorage for post-auth return. @src/pages/LoginPage.vue#45-77

## Deployment & ops notes
- Built with Quasar CLI/Vite, Vue 3, Pinia, Vue Router, Axios.  
- SPA build output: `dist/spa/`; Cloudflare Workers config in `wrangler.jsonc` with SPA fallback.  
- Environment switch via `import.meta.env.PROD` for API host.  
- Lint/format scripts provided; TypeScript strict enabled.

## Future/roadmap placeholders visible in UI
- Device logs tab (“Coming soon”).  
- Account preferences (themes, notifications).  
- Account deletion not yet implemented.  

## Messaging angles for marketing site
1) **“Ship firmware from the browser or CLI.”** Emphasize dual workflow: UI for oversight, CLI for power users.  
2) **“Safe by default.”** OAuth login, cookie sessions (no localStorage tokens), confirmations for destructive actions, token one-time reveal.  
3) **“Faster turnarounds.”** Inline status chips, quick stats, toast feedback, size guard before uploads, version rollback in one click.  
4) **“Onboard in minutes.”** Google sign-in, create project, add device, push script with provided templates.  
5) **“Cloudflare-native delivery.”** SPA hosted on Workers; low-latency global edge.  
6) **“Observability-ready.”** Tabs and placeholders for logs/monitoring to signal roadmap.  

## Audience & use cases
- IoT startups needing managed fleet control without building their own console.  
- Ops teams coordinating multiple environments (dev/prod) with consistent CLI + UI flows.  
- Developers wanting rapid script iteration and rollbacks for edge devices.  

## Quick facts (site-friendly bullets)
- Google OAuth with cookie-based sessions (no token juggling).  
- Projects & devices with inline stats and device online indicator.  
- Script deployment with templates, size guard, and version rollback.  
- API tokens with one-time reveal and managed/user tagging.  
- Cloudflare Workers-ready SPA build.  
- Responsive Quasar UI with dark-friendly color tokens.  

## Suggested homepage sections (content starter)
- **Hero:** “Control every device from a single dashboard” + CTA “Launch console” / “Start with Google”.  
- **How it works:** 3 steps (Sign in → Create project → Deploy script).  
- **Features grid:** Projects, Devices, Scripts & Versions, API Tokens, OAuth security, Edge hosting.  
- **Workflow highlight:** Split “CLI + Dashboard” callout showing harmony.  
- **Security note:** Cookie sessions, OAuth, one-time token reveal, delete confirmations.  
- **Roadmap teaser:** Logs, preferences, richer monitoring “coming soon”.  
