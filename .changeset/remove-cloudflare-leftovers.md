---
"@devicesdk/dashboard": patch
"@devicesdk/firmware-esp32": patch
"@devicesdk/firmware-pico": patch
"@devicesdk/website": patch
---

Remove leftover Cloudflare tooling from the self-host pivot. None of these were
reachable anymore after the move off Workers/Pages/R2; they only confused the
build surface and a publicly-shipped author field.

- **dashboard**: dropped the `wrangler pages deploy` script and the unused
  `wrangler` devDependency (the SPA is served by the Bun server now), and fixed
  the `author` email that still pointed at a `@cloudflare.com` address.
- **firmware-esp32 / firmware-pico**: removed the dead `publish` scripts that
  uploaded binaries to the R2 `devicesdk-firmwares` bucket, plus the now-unused
  `wrangler` dependency. Firmware ships via rolling GitHub Releases
  (`gh release upload` in `firmware-*.yml`) and the Docker bundle.
- **website**: deleted the stale `inputs/*.md` marketing drafts that still
  described the product as "Cloudflare-native" (Workers/Durable Objects/D1/R2).
  They predated and were superseded by the self-host content rewrite, and were
  not consumed by the Hugo build.
