---
name: cloudflare-runtime-limitations
description: Use when working with Cloudflare Workers RPC bindings (WorkerEntrypoint, service bindings, Durable Object stubs), Worker Loader (dynamic workers), or compatibility flags. Covers known runtime gotchas, ServiceStub serialization rules, and patterns to avoid.
---

# Cloudflare Workers Runtime — Known Limitations & Gotchas

This skill documents non-obvious behaviors of the Cloudflare Workers runtime that have bitten this codebase. Read it before adding patterns that involve RPC stubs, dynamic workers, or compat-flag-gated features.

## RPC stubs are not JS objects

A binding like `env.SOMETHING` (a `Service`, `WorkerEntrypoint` instance, `DurableObjectStub`, or anything backed by Workers RPC) **looks like** a JS object but is actually a remote handle. Property access and method calls are translated into RPC operations.

This means:

- `env.API.foo` is itself an RPC stub representing the `foo` property of the remote object — not a JS `Function`.
- Calling `env.API.foo()` invokes `foo` over RPC.
- Calling `env.API.foo.bar()` invokes a remote method `bar` on the `foo` stub.
- This applies recursively. Any deep access is interpreted as RPC unless you escape it.

### Don't `.bind()` on RPC stub methods

```js
// BAD — runtime sees ".bind" as a remote method named "bind"
// with env.API passed as a ServiceStub argument. Throws:
//   DataCloneError: ServiceStub serialization requires the 'experimental' compat flag.
const fn = env.API.foo.bind(env.API);

// GOOD — direct property reference is callable
const fn = env.API.foo;

// ALSO GOOD — force the JS-level Function.prototype.bind
const fn = Function.prototype.bind.call(env.API.foo, env.API);
```

The third form works because `Function.prototype.bind.call(target, thisArg)` is invoked on the `Function.prototype` object (a real local function), with the stub passed in as the receiver. The runtime never sees a `.bind` lookup on the stub itself.

### When wrapping a stub in a Proxy

Common pattern: wrap an RPC binding in a Proxy to allowlist methods or strip internals before handing it to user code. **Return the property reference directly — never call `.bind()` on it.**

```js
const safe = new Proxy(env.API, {
  get(target, prop) {
    if (typeof prop === 'string' && ALLOWED.has(prop)) {
      return target[prop];          // OK
      // return target[prop].bind(target);  // BAD — fires DataCloneError
    }
    return undefined;
  },
});
```

See `apps/api/src/durableObjects/lib/classProxy.ts` for the canonical implementation in this codebase. ROADMAP entry #30 and the matching TROUBLESHOOT.md entry document the incident where this was discovered.

## The `experimental` compatibility flag is not deployable

`compatibilityFlags: ["experimental"]` exists in the runtime but is rejected by the Workers control plane on production deploys:

```
Error: The compatibility flag experimental is experimental
and cannot yet be used in Workers deployed to Cloudflare.
```

This applies both to the parent `wrangler.jsonc` and to dynamic-worker config returned from a Worker Loader factory. **Never assume you can rely on `experimental` to unblock something** — design around the limitation instead. The DataCloneError above is the most common case where you're tempted to reach for it.

When new flags graduate, the canonical reference is <https://developers.cloudflare.com/workers/platform/compatibility-flags/>.

## Worker Loader (dynamic workers) — additional notes

Dynamic workers spawned via `env.LOADER.get(id, factory)` run in their own isolate. Communication with the parent goes through normal RPC bindings supplied via the factory's `env` field.

- **Stable `id` matters.** Using `crypto.randomUUID()` per call spawns a fresh worker every time and quickly hits the "Too many concurrent dynamic workers" rate limit. Use a deterministic id derived from the tenant/version/etc.
- **`getTarget()` returns are RPC handles too.** When `ProxyEntrypoint.getTarget()` returns a plain object of arrow-function methods, the parent-side reference to that object is itself an RPC handle — calling `target.method()` is a round-trip to the child.
- **Hibernation API hostility.** `env.LOADER.get(...).getEntrypoint(name).getTarget()` does not resolve when invoked from inside a Hibernation API event handler (`webSocketMessage`, `webSocketClose`, `webSocketError`). Defer to a normal invocation context — e.g., enqueue work to DO storage and drain it from `alarm()`. See `apps/api/src/durableObjects/lib/device.ts` (`enqueueUserWorkerEvent` / `drainPendingUserWorkerEvents`) and PR #85 for the production pattern.

## Durable Object Hibernation API — both close handlers needed

A hibernating DO must implement **both** `webSocketClose()` and `webSocketError()`. Abrupt TCP drops (e.g. a device hard-reboot) fire `webSocketError`, not `webSocketClose`. Implementing only one means half of disconnects go unhandled.

Shared cleanup logic should live in a helper (`handleConnectionLost()` in `apps/api/src/durableObjects/lib/device.ts`).

## Never send a WebSocket close frame after a reboot command

If the parent side sends a frame that triggers a device reboot, do **not** call `ws.close()` immediately afterwards. Some device firmwares (e.g. lwIP-based Pico builds) crash if a close frame is processed in the same recv callback as a frame that triggered side-effects. Let the connection die naturally — the runtime will fire `webSocketError`/`webSocketClose` once the TCP stream drops.

## Quick reference

| Symptom | Likely cause | Fix |
|---|---|---|
| `DataCloneError: ServiceStub serialization requires the 'experimental' compat flag.` | `.bind()` on an RPC stub method | Drop the `.bind`, or use `Function.prototype.bind.call` |
| `The compatibility flag experimental is experimental and cannot yet be used` | Tried to set `compatibilityFlags: ["experimental"]` | Don't — design around the limitation |
| `Too many concurrent dynamic workers` | Non-stable Worker Loader id | Use a deterministic id |
| Worker Loader call hangs forever | Called from Hibernation API handler | Defer to `alarm()` |
| Disconnect handler doesn't fire on hard reboot | Only implemented `webSocketClose`, not `webSocketError` | Implement both |
