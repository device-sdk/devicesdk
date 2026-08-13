---
"@devicesdk/firmware-esp32": patch
"@devicesdk/firmware-pico": patch
---

The Docker image build now waits for the firmware release published by the same "version packages" merge before bundling firmware, so the image always ships the firmware version released alongside it instead of racing the (up to ~60 minute) firmware build and bundling the previous release. Manual dispatches and tag pushes still build immediately against whatever firmware is already published.
