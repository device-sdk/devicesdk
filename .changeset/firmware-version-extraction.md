---
"@devicesdk/firmware-esp32": patch
"@devicesdk/firmware-pico": patch
"@devicesdk/server": patch
---

Fix firmware version extraction in the CMake build. The regex matched
whitespace with the POSIX `[[:space:]]` character class, which CMake's regex
engine does not support, so every binary silently compiled the `0.0.0-dev`
fallback and devices reported `0.0.0-dev` in the device_connected handshake and
the server firmware column. Whitespace is now matched with escape sequences
(`[ \t\r\n]`), an extraction failure is a hard build error, and a
cmake-only regression check (firmware/scripts/check_version.cmake) fails if the
real package.json version is no longer extracted.