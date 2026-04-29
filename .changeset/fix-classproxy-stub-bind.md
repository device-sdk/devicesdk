---
"@devicesdk/api": patch
---

Fix `DataCloneError: ServiceStub serialization requires the 'experimental' compat flag` thrown by user scripts on every `env.DEVICE.<method>(...)` call. The `safeDevice` Proxy in `classProxy.ts` was returning `target[prop].bind(target)`, but `publicEnv.DEVICE` is an RPC stub — the runtime interpreted `.bind` as a remote method call rather than `Function.prototype.bind`. Returning the property reference directly avoids the serialization path. User scripts can now drive devices end-to-end.
