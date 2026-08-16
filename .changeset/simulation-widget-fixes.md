---
"@devicesdk/simulation": patch
---

Small fixes: widget release timers are cleaned up on unmount (a pending pin
release can no longer fire after a widget is removed), the drop-highlight
selector on the ESP32 board targets the correct circle, log badges are
computed once per row, and dead display state was removed.
