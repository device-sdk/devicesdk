---
"@devicesdk/website": minor
---

Add modern motion across all marketing pages: drifting gradient mesh in heroes, staggered scroll reveals, card-lift hover, button shimmer, animated gradient headline accent, and a live-pulse on the "Private Beta" badge. Introduces a scroll-driven assembly scene on the homepage where TypeScript editor → CLI → edge runtime → ESP32 device fly in and connect with a packet streaming along an animated WebSocket beam. All motion respects `prefers-reduced-motion`. Documents the new motion vocabulary in `apps/website/CLAUDE.md`.

Also fixes a sticky-positioning bug: switches `overflow-x: hidden` to `overflow-x: clip` on `html`/`body`/`main` and the assembly section. `hidden` was creating a scroll container that re-scoped the inner sticky and made scenes scroll past at normal speed; `clip` preserves overflow clipping without breaking sticky.
