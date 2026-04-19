---
"@devicesdk/cli": patch
---

- Fix `devicesdk dev` crashing on startup with `ReferenceError: DurableObject is not defined`. The simulator's `deviceBridge.ts` had only a type-only `declare class DurableObject` and no runtime import, so workerd couldn't find the class and the user's script never loaded. Now imports `DurableObject` from `cloudflare:workers`.
