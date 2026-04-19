---
"@devicesdk/core": minor
---

Add `columnOffset` / `pageOffset` options to the SSD1306 driver and the `display_update` wire command, so panels whose glass doesn't start at RAM column/page 0 can render correctly.

This unblocks the 0.42″ 72×40 SSD1306 OLED used on many ESP32-C3 dev boards (the glass sits at `columnOffset: 30`). Existing 128×64 / 128×32 integrations are unaffected — offsets default to 0 and are only emitted on the wire when non-zero.

On the firmware side, both the ESP32 and Pico `display_update` handlers now accept the two new optional payload fields and apply them to the controller's column/page address ranges. The dimension validator on the Pico was also relaxed from "128×32 or 128×64 only" to "any width ≤128 and height ≤64 that's a multiple of 8" so narrow panels like 72×40 are no longer rejected at the boundary. The SH1106 code path preserves its implicit `columnOffset: 2` default, keeping existing SH1106 integrations pixel-identical.
