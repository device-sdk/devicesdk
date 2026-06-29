---
"@devicesdk/server": patch
---

Fix the dashboard failing to load when served by the server: the CORS
middleware (mounted on every route) reconstructed static-asset responses and
dropped the implicit Content-Type that `Bun.file` derives from the extension,
so `/assets/*.css` and `*.js` were served with an empty Content-Type. Combined
with `nosniff`, browsers refused the stylesheet and module scripts. `serveSpa`
now sets the Content-Type explicitly.
