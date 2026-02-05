# DeviceSDK CLI Technical Specification

This document specifies the complete functionality of the `@devicesdk/cli` command-line tool for managing DeviceSDK IoT projects.

---

## Overview

The DeviceSDK CLI provides a Cloudflare Wrangler-like developer experience for:
- Creating and managing IoT projects
- Configuring devices and their entrypoints
- Running a local development server
- Compiling TypeScript to JavaScript for Cloudflare Workers
- Deploying scripts to all devices in a project

**Package Name:** `@devicesdk/cli`  
**Binary Name:** `devicesdk`  
**Language:** Node.js / TypeScript

---

## Installation

```bash
# Global installation
npm install -g @devicesdk/cli

# Or run via npx
npx @devicesdk/cli <command>
```

---

## Configuration File: `devicesdk.ts`

Every DeviceSDK project requires a `devicesdk.ts` configuration file in the project root.

### Schema

```typescript
import { defineConfig } from "@devicesdk/cli";

export default defineConfig({
  // Required: The project slug (must match API project_id)
  projectId: "my-smart-home",

  // Required: Device configurations
  devices: {
    "living-room": {
      // Path to the device's entrypoint file (relative to project root)
      entrypoint: "./src/devices/living-room.ts",
      // Optional: Human-readable name
      name: "Living Room Controller",
      // Optional: Description
      description: "Controls lights and sensors",
    },
    "bedroom": {
      entrypoint: "./src/devices/bedroom.ts",
      name: "Bedroom Controller",
    },
    "garage": {
      entrypoint: "./src/devices/garage.ts",
    },
  },
});
```

### Type Definition

```typescript
export interface DeviceConfig {
  entrypoint: string;
  name?: string;
  description?: string;
}

export interface DeviceSDKConfig {
  projectId: string;
  devices: Record<string, DeviceConfig>;
}

export function defineConfig(config: DeviceSDKConfig): DeviceSDKConfig;
```

---

## Commands

### `devicesdk login`

Authenticate the CLI with the DeviceSDK API.

**Usage:**
```bash
devicesdk login
```

**Behavior:**
1. Opens browser to `https://dash.devicesdk.com/cli/auth` with a generated state parameter
2. Waits for callback with authorization code
3. Exchanges code for access token via `POST /v1/cli/token`
4. Stores credentials in `~/.devicesdk/credentials.json`

**Output:**
```
✓ Logged in as user@example.com
```

**See:** [CLI Auth Specification](./cli-auth-specification.md) for authentication flow details.

---

### `devicesdk logout`

Remove stored credentials.

**Usage:**
```bash
devicesdk logout
```

**Behavior:**
1. Deletes `~/.devicesdk/credentials.json`
2. Optionally revokes token via `POST /v1/cli/revoke`

**Output:**
```
✓ Logged out successfully
```

---

### `devicesdk whoami`

Display current authenticated user.

**Usage:**
```bash
devicesdk whoami
```

**API Call:**
```
GET /v1/user/me
Authorization: Bearer <token>
```

**Output:**
```
Logged in as: user@example.com
User ID: abc123-def456
```

---

### `devicesdk init [project-id]`

Initialize a new DeviceSDK project.

**Usage:**
```bash
devicesdk init                    # Interactive mode
devicesdk init my-project         # With project ID
devicesdk init my-project -y      # Skip prompts, use defaults
```

**Options:**
| Flag | Description |
|------|-------------|
| `-y, --yes` | Skip prompts and use defaults |
| `--template <name>` | Use a starter template (default: `basic`) |
| `--no-git` | Skip git initialization |

**Available Templates:**
- `basic` - Single device with basic blink example
- `multi-device` - Multiple devices with shared utilities
- `empty` - Just the config file, no device code

**Behavior:**
1. **Check for existing config** - Exit if `devicesdk.ts` already exists
2. **Prompt for project ID** (if not provided)
3. **Create project on API:**
   ```
   POST /v1/projects
   { "project_id": "<project-id>" }
   ```
4. **Generate project structure:**
   ```
   my-project/
   ├── devicesdk.ts
   ├── package.json
   ├── tsconfig.json
   ├── src/
   │   └── devices/
   │       └── device.ts
   └── .gitignore
   ```
5. **Install dependencies:** `npm install`

**Output:**
```
✓ Created project "my-project" on DeviceSDK
✓ Generated devicesdk.ts
✓ Generated src/devices/device.ts
✓ Installed dependencies

Next steps:
  cd my-project
  devicesdk dev           # Start local development
  devicesdk deploy        # Deploy to production
```

---

### `devicesdk dev`
keep existing logic

---

### `devicesdk build`

Compile TypeScript entrypoints to JavaScript without deploying.

**Usage:**
```bash
devicesdk build                     # All devices
devicesdk build --device bedroom    # Single device
devicesdk build --outdir dist       # Custom output directory
```

**Options:**
| Flag | Description |
|------|-------------|
| `-d, --device <id>` | Build only a specific device |
| `-o, --outdir <path>` | Output directory (default: `.devicesdk/build`) |
| `--minify` | Minify output |
| `--sourcemap` | Generate source maps |

**Behavior:**
1. **Load config** from `devicesdk.ts`
2. **Validate entrypoints** exist and export correct structure
3. **Compile TypeScript** using esbuild with Cloudflare Workers target
4. **Validate output** against script requirements (exports class that extends `DeviceEntrypoint`)
5. **Write to output directory**

**Output Structure:**
```
.devicesdk/build/
├── living-room.js
├── bedroom.js
└── garage.js
```

**Validation Rules:**
- Must export default class extending `DeviceEntrypoint`
- Must implement `onMessage()` method
- Max file size: 1MB

**Output:**
```
✓ Built living-room.js (12.4 KB)
✓ Built bedroom.js (8.2 KB)
✓ Built garage.js (15.1 KB)

Build complete: 3 devices, 35.7 KB total
```

---

### `devicesdk deploy`

Deploy scripts to the DeviceSDK API.

**Usage:**
```bash
devicesdk deploy                        # All devices
devicesdk deploy --device living-room   # Single device
devicesdk deploy -m "v1.2.0 release"    # With message
```

**Options:**
| Flag | Description |
|------|-------------|
| `-d, --device <id>` | Deploy only a specific device |
| `-m, --message <text>` | Deployment message (version note) |
| `--dry-run` | Validate without uploading |

**Behavior (All Devices):**
1. **Load config** from `devicesdk.ts`
2. **Build all devices** (compile TypeScript)
3. **Validate all scripts** locally
4. **Upload via batch endpoint:**
   ```
   PUT /v1/projects/{projectId}/scripts
   Authorization: Bearer <token>
   {
     "devices": {
       "living-room": { "script": "<compiled-js>" },
       "bedroom": { "script": "<compiled-js>" },
       "garage": { "script": "<compiled-js>" }
     },
     "message": "v1.2.0 release"
   }
   ```
5. **Handle auto-creation** - API creates devices that don't exist

**Behavior (Single Device):**
1. **Build single device**
2. **Upload via single endpoint:**
   ```
   PUT /v1/projects/{projectId}/devices/{deviceId}/script
   Authorization: Bearer <token>
   {
     "script": "<compiled-js>",
     "message": "Updated sensor logic"
   }
   ```

**Output:**
```
✓ Built 3 devices
⬆ Uploading to project "my-smart-home"...

✓ living-room  v_abc123  (created)
✓ bedroom      v_def456  (updated)
✓ garage       v_ghi789  (updated)

Deployed 3 devices successfully
```

---

## Global Options

Available on all commands:

| Flag | Description |
|------|-------------|
| `-c, --config <path>` | Path to config file (default: `./devicesdk.ts`) |
| `-v, --verbose` | Enable verbose output |
| `-h, --help` | Show help |
| `--version` | Show CLI version |

---

## Credentials Storage

Credentials are stored in `~/.devicesdk/credentials.json`:

```json
{
  "accessToken": "dsdk_xxxxx",
  "refreshToken": "dsdk_refresh_xxxxx",
  "expiresAt": 1705330800000,
  "email": "user@example.com"
}
```

**Security:**
- File permissions set to `0600` (owner read/write only)
- Tokens refreshed automatically when expired
- Stored refresh token allows offline token renewal

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEVICESDK_API_URL` | Override default API URL |
| `DEVICESDK_TOKEN` | Use token directly (CI/CD) |
| `DEVICESDK_CONFIG` | Path to config file |

---

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |
| `3` | Authentication required |
| `4` | Config file not found |
| `5` | Build/validation error |
| `6` | API error |
| `7` | Network error |

---

## Error Messages

All errors follow a consistent format:

```
✗ Error: <message>

  <details>

  Run `devicesdk <command> --help` for usage information.
```

---

## CI/CD Usage

For automated deployments:

```bash
# Use API token instead of interactive login
export DEVICESDK_TOKEN="dsdk_xxxxx"

# Deploy with message from git
devicesdk deploy -m "$(git log -1 --pretty=%B)"
```

**GitHub Actions Example:**
```yaml
- name: Deploy to DeviceSDK
  env:
    DEVICESDK_TOKEN: ${{ secrets.DEVICESDK_TOKEN }}
  run: |
    npx @devicesdk/cli deploy -m "${{ github.sha }}"
```

---

## TypeScript Compilation

The CLI uses **esbuild** for TypeScript compilation:

**Build Configuration:**
```javascript
{
  entryPoints: ['./src/devices/device.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  conditions: ['workerd', 'worker', 'browser'],
  minify: false,
  sourcemap: false,
}
```

**Supported Features:**
- Full TypeScript support
- ESM imports/exports
- Tree shaking
- Path aliases (via `tsconfig.json`)

---

## Script Requirements

Compiled scripts must:
1. Export a default class extending `DeviceEntrypoint`
2. Implement `onMessage(message: any): Promise<any>`
3. Be under 1MB in size

**Example:**
```typescript
import { DeviceEntrypoint } from "@devicesdk/runtime";

export default class MyDevice extends DeviceEntrypoint {
  async onMessage(message: any) {
    // Handle message from device
    return { status: "ok" };
  }
}
```

---

## API Endpoint Summary

| Command | HTTP Method | Endpoint |
|---------|-------------|----------|
| `login` | POST | `/v1/cli/token` |
| `logout` | POST | `/v1/cli/revoke` |
| `whoami` | GET | `/v1/user/me` |
| `init` | POST | `/v1/projects` |
| `deploy` (all) | PUT | `/v1/projects/{projectId}/scripts` |
| `deploy` (single) | PUT | `/v1/projects/{projectId}/devices/{deviceId}/script` |
| `devices` | GET | `/v1/projects/{projectId}/devices` |
| `devices add` | POST | `/v1/projects/{projectId}/devices` |
| `devices remove` | DELETE | `/v1/projects/{projectId}/devices/{deviceId}` |
| `versions` | GET | `/v1/projects/{projectId}/devices/{deviceId}/script/versions` |
| `rollback` | POST | `/v1/projects/{projectId}/devices/{deviceId}/script/versions/{versionId}/deploy` |
| `projects` | GET | `/v1/projects` |
| `projects delete` | DELETE | `/v1/projects/{projectId}` |
| `token create` | POST | `/v1/tokens` |
| `token list` | GET | `/v1/tokens` |
| `token delete` | DELETE | `/v1/tokens/{tokenId}` |
