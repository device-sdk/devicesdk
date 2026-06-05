---
---

examples(esp32c3-clock): the clock now re-initializes the OLED on every cloud draw (`init: true`) instead of only on connect. The board firmware shares this panel and repaints its "Server"/"Connected" status (re-running the SSD1306 power-on sequence) on every WebSocket disconnect/reconnect, and a brown-out or reboot resets the controller too — so a framebuffer sent without re-init rendered nothing and the clock went dark until the next reboot. Re-initializing each tick is idempotent and cheap, and makes the display self-heal within one minute of any glitch. Examples are unversioned, so this is an empty changeset (CI-gate only).
