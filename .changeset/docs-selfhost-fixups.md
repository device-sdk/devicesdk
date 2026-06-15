---
"@devicesdk/core": patch
"@devicesdk/cli": patch
"@devicesdk/mcp": patch
"@devicesdk/website": patch
"@devicesdk/firmware-pico": patch
"@devicesdk/firmware-esp32": patch
---

Follow-up docs cleanup: fix stale cloud-era references that survived the
self-host pivot.

- **Public docs (`docs/public/`)**: corrected `troubleshooting.md` (dropped
  "edge script/edge location", Cloudflare-era queues, the dead
  `status.devicesdk.com` status page, the hardcoded port-443 firewall note, and
  the request-quota framing — the server only rate-limits auth brute-force);
  fixed `concepts/env-vars.md` (`DeviceSender` → `DeviceEntrypoint` + import),
  `guides/home-assistant.md` (`defineConfig` import from `@devicesdk/cli`, repo
  URL), `cli/init.md` (documented the real `--no-git` flag, removed the
  non-existent `--name`), `cli/deploy.md` (removed the non-existent
  `deploy --version`), `hardware/esp32-c61.md` (`devicesdk-client.bin` →
  `esp32c61-client.bin`), broken `github.com/device-sdk` org-root links, and a
  stray `</content></invoke>` artifact at the end of `resources/faq.md`. Trimmed
  the obsolete Cloudflare/Durable-Object/OAuth "Platform Roadmap" section from
  the (unpublished) `docs/public/ROADMAP.md`.
- **Marketing site (`apps/website`)**: removed the dead cloud-billing model from
  the Solutions page ("Estimated cost / Free tier / ~$0.60/month / daily limit"
  → "Self-hosted"); fixed `export default class` hero/product code samples to
  the required named `export class`; "cloud KV" → "device KV"; rewrote the
  website `README.md` (it still described the old pure-HTML/jQuery/Wrangler
  setup — it's a Hugo + Tailwind site now, still deployed to Cloudflare Pages).
  Also pointed every "GitHub" link (the `githubUrl` param, nav/footer menus,
  footer license link, about page, terms/privacy) at the repo
  (`device-sdk/devicesdk-monorepo`) instead of the bare org root, and aligned a
  "KV namespace" → "KV store" code comment with the rest of the self-host copy.
- **Package READMEs**: `@devicesdk/core` ("sandboxed serverless runtime" →
  in-process on the self-hosted server), `@devicesdk/cli` (`login` now needs
  `--host`), `@devicesdk/mcp` (`auth.json` → `credentials.json`).
- **Firmware (`firmware/pico/README.md`)**: rewrote the stale "devicesdk-client"
  README (cloud backend, port 8787, personal absolute paths) and scrubbed the
  committed Wi-Fi credentials / API tokens it documented. Docs only — no
  firmware behavior change.
- **Firmware (`firmware/esp32/`)**: rewrote the bare ESP-IDF "Hello World"
  `README.md` into a real DeviceSDK ESP32 firmware doc, rewrote the
  Pico-porting-guide `IMPLEMENTATIONS.md` into an accurate ESP32 architecture
  reference, deleted the redundant `PROJECT_SUMMARY.md` (leaked personal path +
  wrong CC0 license claim), and dropped the obsolete Cloudflare Durable-Object
  billing rationale from a `config.h` comment. Docs/comment only.
