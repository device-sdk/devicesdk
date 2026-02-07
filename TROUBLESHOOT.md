# Troubleshooting Log

### Local dev Google OAuth login completes but user remains unauthenticated
**Date**: 2026-02-07
**Question/Problem**: When running the API (wrangler dev, port 8787) and dashboard (Quasar dev, port 9000) locally, Google OAuth login completes visually but `GET /v1/user/me` returns 401. Only one `GET /v1/auth/google` request appears in API logs instead of two (initial + callback).
**Root Cause**: Two issues:
1. `redirect_uri` in `src/index.ts:98` pointed to port 9000 (dashboard) instead of 8787 (API). Google redirected the callback to the dashboard SPA, which has no handler for `/v1/auth/google`, so the callback never reached the API and no session was created.
2. Cookie flags in `src/foundation/auth.ts` for the local dev path used `domain: ".localhost"`, `sameSite: "None"`, and `secure: true`. Browsers reject `secure: true` cookies over HTTP, and `sameSite: "None"` also requires a secure context.
**Solution**:
1. Changed `redirect_uri` port from `9000` to `8787` in `apps/api/src/index.ts`.
2. Changed cookie settings in `apps/api/src/foundation/auth.ts` for both `handleGoogleCallback` and `handleLogout` local dev paths: `domain: "localhost"` (no leading dot), `sameSite: "Lax"`, `secure: false`.
3. Ensure `apps/api/.dev.vars` contains `ENV=local` so the local code paths activate (base `wrangler.jsonc` sets `ENV: "production"`).
4. Ensure `http://localhost:8787/v1/auth/google` is registered as an authorized redirect URI in Google Console.
