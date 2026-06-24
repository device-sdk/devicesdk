---
title: "How do I watch a device's state and logs in real time?"
description: "Stream live logs and structured state via devicesdk logs --tail or the watch WebSocket"
url: http://localhost:1313/docs/recipes/watch-device-logs/
---

# How do I watch a device's state and logs in real time?

> Stream live logs and structured state via devicesdk logs --tail or the watch WebSocket


DeviceSDK exposes a single WebSocket endpoint that delivers connection status, logs, and structured state events for a device. The CLI's `devicesdk logs` is a thin wrapper; the dashboard uses the same endpoint; you can call it directly from any HTTP client too.

## From the CLI

```bash
# Replay the last 50 entries, then exit
devicesdk logs my-project sensor-1

# Stream live entries (Ctrl-C to stop)
devicesdk logs my-project sensor-1 --tail

# Stream as NDJSON for piping into jq, ndjson tools, etc.
devicesdk logs my-project sensor-1 --tail --json | jq 'select(.entry.level == "error")'
```

If you're inside a project directory, `devicesdk.ts` provides the project + device defaults — you can omit positionals:

```bash
devicesdk logs --tail
```

## From a script (Node, Bun, Deno)

The watch endpoint is `wss://api.devicesdk.com/v1/projects/:projectId/devices/:deviceId/watch`. Authenticate with a Bearer token (CLI token, API token, or session cookie):

```typescript
import WebSocket from "ws";

const token = process.env.DEVICESDK_TOKEN!;
const ws = new WebSocket(
  `wss://api.devicesdk.com/v1/projects/my-project/devices/sensor-1/watch?backfillLimit=100`,
  { headers: { Authorization: `Bearer ${token}` } },
);

ws.on("message", (raw) => {
  const frame = JSON.parse(raw.toString());
  // frame.event is one of "log", "status", "state", "history_complete"
  if (frame.event === "log") {
    console.log(`[${frame.data.level}] ${frame.data.message}`);
  } else if (frame.event === "status") {
    console.log(frame.data.connected ? "device online" : "device offline");
  } else if (frame.event === "state") {
    console.log(`state: ${frame.data.entity_id} = ${frame.data.value}`);
  }
});
```

## Frame types

| `event` | When | `data` shape |
|---|---|---|
| `log` | Every `console.log/info/warn/error` call from the script, plus `persistLog` calls. Replayed history is also delivered as `log` frames with `replay: true`. | `{ id, level, message, created_at }` |
| `status` | Whenever the device connects or disconnects. | `{ connected, connectedSince }` |
| `state` | Whenever the script calls `this.env.DEVICE.emitState(entityId, value)`. | `{ entity_id, value, timestamp }` |
| `history_complete` | Marker that the initial backfill is done; live frames follow. | `{}` |

## Common patterns

- **Triage a flaky device.** `devicesdk logs <project> <device> --tail` and look for `command_error` frames in the log stream.
- **Hook into your own monitoring.** Connect to the watch WebSocket from a long-running worker; forward `state` frames to a database or alerting tool.
- **Build a custom dashboard.** Same WebSocket, same auth — render whatever you want.

## Related

- [Real-time watch guide](/docs/guides/real-time-watch/) — full WebSocket protocol reference.
- [`emitState`](/docs/concepts/emit-state/) — how to push custom state into the stream.
- [`devicesdk logs`](/docs/cli/logs/) — the CLI command reference.

