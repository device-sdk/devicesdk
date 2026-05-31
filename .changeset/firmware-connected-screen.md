---
"@devicesdk/firmware-esp32": patch
---

Boot panel now shows "Server" while the WebSocket connection is in progress and switches to "Connected" once the server connection succeeds (it previously showed "Server" at the moment of connection, which was ambiguous). On disconnect it reverts to "Server" until it reconnects. As before, the first cloud `display_update` after the `device_connected` handshake overwrites this status text — so a panel stuck on "Server" now unambiguously means the device never finished connecting to the server, while "Connected" confirms the link is up and it's waiting on the cloud's first frame.
