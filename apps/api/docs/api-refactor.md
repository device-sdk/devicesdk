# API Refactor Plan

This document describes the complete refactor needed to transform the DeviceSDK API into its desired state, supporting:
- User-defined slugs for projects and devices (predictable URLs)
- Per-device scripts with versioning
- CLI tool support for batch uploads
- Cloudflare Workers-like developer experience

## Current vs Target State

### Current State
- Projects have a single script shared across all "devices"
- Devices are not stored entities (just IDs in URLs)
- `project_id` is user-defined slug ✓
- Script versions are tied to projects, not devices

### Target State
- Projects contain multiple devices
- Each device has its own script with version history
- Both `project_id` and `device_id` are user-defined slugs
- CLI can batch-upload scripts for all devices in a project

---

## Database Changes

### Migration: `0005_add_devices_table.sql`

```sql
-- Add devices table
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  device_slug TEXT NOT NULL,
  name TEXT,
  description TEXT,
  current_version_id TEXT,
  last_connected_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, device_slug)
);

-- Add index for faster lookups
CREATE INDEX idx_devices_project_id ON devices(project_id);
```

### Migration: `0006_refactor_script_versions.sql`

```sql
-- Rename and refactor project_versions to device_scripts
-- Note: This is a breaking change, existing data will need migration

CREATE TABLE device_scripts (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  message TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX idx_device_scripts_device_id ON device_scripts(device_id);

-- Drop old table after data migration
-- DROP TABLE project_versions;
```

### Migration: `0007_update_projects_table.sql`

```sql
-- Add optional fields to projects
ALTER TABLE projects ADD COLUMN name TEXT;
ALTER TABLE projects ADD COLUMN description TEXT;
ALTER TABLE projects ADD COLUMN updated_at INTEGER;
```

### Types Update (`src/types.d.ts`)

```typescript
export type tableDevices = {
  id: string;
  project_id: string;
  device_slug: string;
  name?: string;
  description?: string;
  current_version_id?: string;
  last_connected_at?: number;
  created_at: number;
  updated_at: number;
};

export type tableDeviceScripts = {
  id: string;
  device_id: string;
  version_id: string;
  message?: string;
  created_at: number;
};

// Update tableProjects
export type tableProjects = {
  id: string;
  user_id: string;
  project_id: string;  // user-defined slug
  name?: string;
  description?: string;
  created_at: number;
  updated_at?: number;
};
```

---

## R2 Storage Structure

### Current
```
/{userId}/{projectSlug}/{versionId}.js
```

### Target
```
/{userId}/{projectSlug}/{deviceSlug}/{versionId}.js
/{userId}/{projectSlug}/{deviceSlug}/latest.js  (copy of current deployed version)
```

---

## API Endpoints

### Projects Router (`/v1/projects`)

| Method | Endpoint | Operation ID | Description | Status |
|--------|----------|--------------|-------------|--------|
| GET | `/` | `projects-list` | List all projects | EXISTS - keep |
| POST | `/` | `projects-create` | Create a new project | MODIFY - remove script upload |
| GET | `/:projectId` | `projects-get` | Get project details | MODIFY - include devices |
| PUT | `/:projectId` | `projects-update` | Update project | NEW |
| DELETE | `/:projectId` | `projects-delete` | Delete project | NEW |

### Devices Router (`/v1/projects/:projectId/devices`)

| Method | Endpoint | Operation ID | Description | Status |
|--------|----------|--------------|-------------|--------|
| GET | `/` | `devices-list` | List devices in project | NEW |
| POST | `/` | `devices-create` | Register a new device | NEW |
| GET | `/:deviceId` | `devices-get` | Get device details | NEW |
| PUT | `/:deviceId` | `devices-update` | Update device | NEW |
| DELETE | `/:deviceId` | `devices-delete` | Delete device | NEW |
| GET | `/:deviceId/connect/websocket` | `devices-connect` | WebSocket connection | EXISTS - keep |
| GET | `/:deviceId/firmware` | `devices-firmware` | Download firmware | EXISTS - keep |

### Scripts Router (`/v1/projects/:projectId/devices/:deviceId/script`)

| Method | Endpoint | Operation ID | Description | Status |
|--------|----------|--------------|-------------|--------|
| GET | `/` | `scripts-get` | Get current script | NEW |
| PUT | `/` | `scripts-upload` | Upload new script version | NEW |
| GET | `/versions` | `scripts-versions-list` | List script versions | NEW |
| GET | `/versions/:versionId` | `scripts-version-get` | Get specific version | NEW |
| POST | `/versions/:versionId/deploy` | `scripts-deploy` | Deploy specific version | NEW |

### Batch Scripts (`/v1/projects/:projectId/scripts`)

| Method | Endpoint | Operation ID | Description | Status |
|--------|----------|--------------|-------------|--------|
| PUT | `/` | `scripts-batch-upload` | Upload scripts for multiple devices | NEW |

---

## Endpoint Specifications

### POST `/v1/projects` - Create Project

**Request:**
```json
{
  "project_id": "my-smart-home",
  "name": "My Smart Home",
  "description": "Home automation project"
}
```

**Response (201):**
```json
{
  "success": true,
  "result": {
    "id": "uuid",
    "project_id": "my-smart-home",
    "name": "My Smart Home",
    "description": "Home automation project",
    "created_at": 1703347200000
  }
}
```

**Validation:**
- `project_id`: 1-24 chars, slug format (lowercase, alphanumeric, hyphens)
- Must be unique per user

---

### GET `/v1/projects/:projectId` - Get Project

**Response (200):**
```json
{
  "success": true,
  "result": {
    "id": "uuid",
    "project_id": "my-smart-home",
    "name": "My Smart Home",
    "description": "Home automation project",
    "created_at": 1703347200000,
    "devices": [
      {
        "device_id": "living-room",
        "name": "Living Room Controller",
        "status": "online",
        "last_connected_at": 1703347200000
      }
    ],
    "device_count": 1
  }
}
```

---

### POST `/v1/projects/:projectId/devices` - Create Device

**Request:**
```json
{
  "device_id": "living-room",
  "name": "Living Room Controller",
  "description": "Controls lights and sensors"
}
```

**Response (201):**
```json
{
  "success": true,
  "result": {
    "id": "uuid",
    "device_id": "living-room",
    "name": "Living Room Controller",
    "description": "Controls lights and sensors",
    "created_at": 1703347200000
  }
}
```

**Validation:**
- `device_id`: 1-36 chars, slug format
- Must be unique within project

---

### GET `/v1/projects/:projectId/devices` - List Devices

**Response (200):**
```json
{
  "success": true,
  "result": [
    {
      "id": "uuid",
      "device_id": "living-room",
      "name": "Living Room Controller",
      "status": "online",
      "current_version_id": "abc123",
      "last_connected_at": 1703347200000,
      "created_at": 1703347200000
    }
  ]
}
```

---

### PUT `/v1/projects/:projectId/devices/:deviceId/script` - Upload Script

**Request:**
```json
{
  "script": "import { WorkerEntrypoint } from 'cloudflare:workers';\n...",
  "message": "Added temperature monitoring"
}
```

**Response (201):**
```json
{
  "success": true,
  "result": {
    "version_id": "abc123",
    "device_id": "living-room",
    "message": "Added temperature monitoring",
    "created_at": 1703347200000
  }
}
```

**Side Effects:**
- Stores script in R2: `/{userId}/{projectId}/{deviceId}/{versionId}.js`
- Updates `/{userId}/{projectId}/{deviceId}/latest.js`
- Updates `devices.current_version_id`
- Validates script using existing `validateUserScript()`

---

### PUT `/v1/projects/:projectId/scripts` - Batch Upload Scripts

**Request:**
```json
{
  "devices": {
    "living-room": {
      "script": "import { WorkerEntrypoint }..."
    },
    "bedroom": {
      "script": "import { WorkerEntrypoint }..."
    }
  },
  "message": "v1.2.0 release"
}
```

**Response (201):**
```json
{
  "success": true,
  "result": {
    "versions": [
      {
        "device_id": "living-room",
        "version_id": "abc123",
        "status": "success"
      },
      {
        "device_id": "bedroom",
        "version_id": "def456",
        "status": "success"
      }
    ],
    "message": "v1.2.0 release"
  }
}
```

**Behavior:**
- Auto-creates devices that don't exist
- Validates all scripts before uploading any
- Atomic: all succeed or none (rollback on failure)

---

### GET `/v1/projects/:projectId/devices/:deviceId/script/versions` - List Versions

**Response (200):**
```json
{
  "success": true,
  "result": [
    {
      "version_id": "abc123",
      "message": "Added temperature monitoring",
      "is_current": true,
      "created_at": 1703347200000
    },
    {
      "version_id": "xyz789",
      "message": "Initial version",
      "is_current": false,
      "created_at": 1703340000000
    }
  ]
}
```

---

## File Structure Changes

### New Files to Create

```
src/endpoints/
├── projects/
│   ├── router.ts              # MODIFY - add new routes
│   ├── createProject.ts       # MODIFY - remove script upload
│   ├── getProject.ts          # MODIFY - include devices
│   ├── listProjects.ts        # KEEP
│   ├── updateProject.ts       # NEW
│   ├── deleteProject.ts       # NEW
│   ├── deviceConnect.ts       # KEEP
│   └── downloadFirmware.ts    # KEEP
├── devices/
│   ├── router.ts              # NEW
│   ├── createDevice.ts        # NEW
│   ├── getDevice.ts           # NEW
│   ├── listDevices.ts         # NEW
│   ├── updateDevice.ts        # NEW
│   └── deleteDevice.ts        # NEW
└── scripts/
    ├── router.ts              # NEW
    ├── uploadScript.ts        # NEW
    ├── getScript.ts           # NEW
    ├── listVersions.ts        # NEW
    ├── getVersion.ts          # NEW
    ├── deployVersion.ts       # NEW
    └── batchUpload.ts         # NEW

migrations/
├── 0005_add_devices_table.sql       # NEW
├── 0006_refactor_script_versions.sql # NEW
└── 0007_update_projects_table.sql   # NEW
```

### Router Updates (`src/index.ts`)

```typescript
import { devicesRouter } from "./endpoints/devices/router";
import { scriptsRouter } from "./endpoints/scripts/router";

// Nested routers
app.route("/v1/projects", projectsRouter);
app.route("/v1/projects/:projectId/devices", devicesRouter);
app.route("/v1/projects/:projectId/devices/:deviceId/script", scriptsRouter);
```

---

## Implementation Order

### Phase 1: Database & Types (Day 1)
1. [x] Create migration `0005_add_devices_table.sql`
2. [x] Create migration `0006_add_device_scripts_table.sql`
3. [x] Create migration `0007_update_projects_table.sql`
4. [x] Update `src/types.d.ts` with new table types
5. [ ] Run migrations locally and test

### Phase 2: Device Endpoints (Day 2)
1. [x] Create `src/endpoints/devices/router.ts`
2. [x] Implement `createDevice.ts`
3. [x] Implement `listDevices.ts`
4. [x] Implement `getDevice.ts`
5. [x] Implement `updateDevice.ts`
6. [x] Implement `deleteDevice.ts`
7. [ ] Write tests for device endpoints

### Phase 3: Script Endpoints (Day 3)
1. [x] Create `src/endpoints/scripts/router.ts`
2. [x] Implement `uploadScript.ts` (single device)
3. [x] Implement `getScript.ts`
4. [x] Implement `listVersions.ts`
5. [x] Implement `batchUpload.ts`
6. [ ] Write tests for script endpoints

### Phase 4: Refactor Existing (Day 4)
1. [x] Modify `createProject.ts` - remove script upload logic
2. [x] Modify `getProject.ts` - include devices in response
3. [x] Implement `updateProject.ts`
4. [x] Implement `deleteProject.ts`
5. [x] Update `deviceConnect.ts` to validate device exists
6. [x] Update device DO to use new R2 paths

### Phase 5: Testing & Cleanup (Day 5)
1. [ ] Integration tests for full CLI workflow
2. [ ] Update OpenAPI spec
3. [ ] Data migration script for existing projects
4. [ ] Update `templates/README.md` with new API docs
5. [ ] Remove deprecated code

---

## Breaking Changes

1. **`POST /v1/projects`** no longer accepts `script` - use device script endpoints
2. **R2 paths changed** - scripts now at `/{userId}/{projectId}/{deviceId}/{version}.js`
3. **`project_versions` table deprecated** - replaced by `device_scripts`

## Migration Path for Existing Users

1. Create a device called "default" for each existing project
2. Move existing script versions to that device
3. Update R2 paths accordingly

---

## CLI Integration Points

The CLI tool will use these endpoints:

```bash
# Initialize project
devicesdk init my-project
→ POST /v1/projects { project_id: "my-project" }

# Add device
devicesdk device add living-room
→ POST /v1/projects/my-project/devices { device_id: "living-room" }

# Deploy all devices
devicesdk deploy
→ PUT /v1/projects/my-project/scripts { devices: {...} }

# Deploy single device
devicesdk deploy --device living-room
→ PUT /v1/projects/my-project/devices/living-room/script { script: "..." }

# List versions
devicesdk versions living-room
→ GET /v1/projects/my-project/devices/living-room/script/versions

# Rollback
devicesdk rollback living-room abc123
→ POST /v1/projects/my-project/devices/living-room/script/versions/abc123/deploy
```

---

## Validation Rules

### Slug Format (project_id, device_id)
- Lowercase alphanumeric and hyphens only
- Must start with a letter
- 1-36 characters
- Regex: `^[a-z][a-z0-9-]{0,35}$`

### Script Validation
- Max 1MB
- Must pass `validateUserScript()` (existing)
- Must export default class extending WorkerEntrypoint
