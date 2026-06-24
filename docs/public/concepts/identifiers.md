---
title: Project & Device Identifiers
description: How project slugs and device slugs map to your devicesdk.ts config
social_image: /og-images/docs/concepts/identifiers.png
---

## Two slugs you'll see everywhere

Every DeviceSDK project uses two human-readable identifiers:

- **Project slug** - declared as `projectId` in `devicesdk.ts`. URL-safe, scoped to your account.
- **Device slug** - the **key** of an entry under `devices: { ... }` in the same file. URL-safe, scoped to the project.

```typescript
// devicesdk.ts
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  projectId: "smart-home",         // ← project slug
  devices: {
    "front-door": {                 // ← device slug
      main: "./src/devices/door.ts",
      className: "Door",
      deviceType: "pico-w",
      wifi: { ssid: "...", password: "..." },
    },
    "garage-door": {                // ← another device slug
      main: "./src/devices/garage.ts",
      className: "Garage",
      deviceType: "esp32c3",
      wifi: { ssid: "...", password: "..." },
    },
  },
});
```

In the example above:
- `smart-home` is the **project slug** - what you'd pass as the project argument anywhere a CLI command takes one.
- `front-door` and `garage-door` are **device slugs** - what you pass as the device argument.

## How they're used

Every CLI command and API URL accepts the slugs:

```bash
devicesdk logs front-door                       # uses smart-home from devicesdk.ts
devicesdk logs smart-home front-door            # both explicit
devicesdk inspect garage-door
devicesdk flash front-door
```

```
GET /v1/projects/smart-home/devices/front-door/watch
```

Most CLI commands default the project (and the device, when there's only one) from `devicesdk.ts`, so you can usually omit them entirely when running inside a project directory.

## Slugs vs UUIDs

Internally, every project and device also has an immutable UUID - that's the `id` column you'll occasionally see in API responses. **You don't need to use the UUIDs directly**: every public surface (CLI, dashboard, REST URLs) accepts the slugs, and the server resolves the UUID for you. Slugs can be renamed; UUIDs cannot.

## Naming rules

Slugs must be:
- Lowercase letters, numbers, and hyphens
- 1-63 characters
- Not start or end with a hyphen

Pick something descriptive - `garage-door` reads better than `device-2` in dashboard tables, `devicesdk status` output, and log streams.

## Related

- [Entrypoints](/docs/concepts/entrypoints/) - how device classes connect to slugs
- [Inter-Device Communication](/docs/guides/inter-device-communication/) - calling methods on other devices by slug
- [`devicesdk` CLI reference](/docs/cli/) - every command that takes a slug
