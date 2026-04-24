---
"@devicesdk/api": patch
---

Defer user-worker `onDeviceConnect` and unsolicited `onMessage` invocations to a Durable Object alarm instead of running them inside the Hibernation-API `webSocketMessage` handler. Invoking the Worker Loader (`getTarget()`) from the hibernation handler hangs in production — scripts never ran on device connect, the OLED never rendered, `gpio_state_changed` events were dropped, and no error ever surfaced. Events are now persisted to a `__internal:pending_user_events` queue and drained from `alarm()`, which runs in a fresh invocation context where Worker Loader works as expected.
