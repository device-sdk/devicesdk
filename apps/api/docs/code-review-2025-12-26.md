# Code Review: API Refactor (Commit 706e0b4)

**Reviewer:** Cascade  
**Date:** December 26, 2025  
**Commit:** `706e0b497effacbccc0509d252e93e6c2bf9dfb9` - "Refactor everything"

---

## Overview

This commit implements the API refactor described in `docs/api-refactor.md`, adding support for per-device scripts with versioning, user-defined slugs for devices, and CLI tool support for batch uploads. The changes span 30 files with ~2,425 lines added and ~161 lines removed.

---

## Summary

| Category | Status |
|----------|--------|
| **Database Migrations** | Implemented correctly |
| **Device Endpoints** | Complete |
| **Script Endpoints** | Complete |
| **Project Endpoints** | Updated correctly |
| **Durable Objects** | Updated for new R2 paths |
| **Types** | Updated |
| **Tests** | Not included (Phase 5 pending) |

---

## Positive Observations

### 1. Clean Architecture
- Good separation of concerns with dedicated routers for devices, scripts, and projects
- Consistent file naming conventions (`createDevice.ts`, `listDevices.ts`, etc.)
- OpenAPI schemas properly defined for all endpoints

### 2. API Response Format Consistency
All endpoints correctly follow the standardized response format:
```json
{ "success": true, "result": <any> }
{ "success": false, "error": "<message>" }
```

### 3. Validation Implementation
- Device and project slugs properly validated with regex `^[a-z][a-z0-9-]{0,35}$`
- Script size limited to 1MB as specified
- `validateUserScript()` reused from existing codebase

### 4. Backward Compatibility
- `deviceConnect.ts` auto-creates devices if they don't exist (good for migration)
- Existing `project_versions` table preserved (not dropped yet)

### 5. R2 Storage Structure
Correctly implements new path structure:
```
/{userId}/{projectId}/{deviceId}/{versionId}.js
/{userId}/{projectId}/{deviceId}/latest.js
```

---

## Issues & Recommendations

### Critical Issues

#### 1. Missing `scripts-version-get` Endpoint
**Location:** `src/endpoints/scripts/router.ts`

Per the spec in `api-refactor.md`:
```
| GET | `/versions/:versionId` | `scripts-version-get` | Get specific version | NEW |
```

This endpoint is **not implemented**. The router only has:
- `GET /` - GetScript
- `PUT /` - UploadScript  
- `GET /versions` - ListVersions
- `POST /versions/:versionId/deploy` - DeployVersion

**Recommendation:** Add `GetVersion` endpoint to retrieve a specific script version's content.

---

### Medium Priority Issues

#### 5. Missing Validation in `downloadFirmware.ts`
**Location:** `src/endpoints/devices/downloadFirmware.ts:37-42`

The endpoint doesn't validate that the project/device belongs to the authenticated user. It only checks for `new_key` query param.

```typescript
public async handle(c: AppContext) {
  const { deviceId } = c.req.param();
  const newKey = c.req.query("new_key");
  // No user/project ownership validation!
```

**Recommendation:** Add project/device ownership check similar to other endpoints.

---

### Low Priority Issues

#### 6. Redundant Regex Validation
**Location:** `src/endpoints/devices/createDevice.ts:66-77`

The regex is already enforced via Zod schema validation at line 22-25. The manual check at line 68 is redundant.

```typescript
// Zod already validates this:
device_id: z.string().min(1).max(36).regex(deviceSlugRegex, ...)

// Then redundant check:
if (!deviceSlugRegex.test(deviceSlug)) { ... }
```

Same issue in `createProject.ts:59-70`.

**Recommendation:** Remove manual regex checks or rely solely on Zod. Chanfana should handle Zod validation errors automatically.

#### 8. Inconsistent Response Schema in `getProject.ts`
**Location:** `src/endpoints/projects/getProject.ts:29-35`

The `devices` array in the response doesn't include `status` field mentioned in the spec:
```json
// Spec shows:
"status": "online"

// Implementation only has:
device_id, name, last_connected_at
```

recomendation: because status does not exist, just return a string to always online

#### 9. Missing `updated_at` in Some Response Schemas
**Location:** `src/endpoints/devices/listDevices.ts:22-31`

The `ListDevices` response doesn't include `updated_at`, but `GetDevice` does. Consider consistency.

#### 10. Unused Import Check Needed
The `tableDeviceScripts` type is imported but ensure all imports are necessary across files.

---

### Code Style Observations

---

## Database Migration Review

### `0005_add_devices_table.sql`
- Schema matches spec
- Index on `project_id` for faster lookups
- `ON DELETE CASCADE` properly set

### `0006_add_device_scripts_table.sql`
- Schema matches spec
- Index on `device_id` for faster lookups
- `ON DELETE CASCADE` properly set

### `0007_update_projects_table.sql`
- Adds `name`, `description`, `updated_at` columns
- Uses `ALTER TABLE ADD COLUMN` - safe for SQLite/D1

**Note:** The spec mentions dropping `project_versions` table eventually. This hasn't been done yet (correctly, as existing data needs migration first).

---

## Durable Objects Review

### `device.ts` - R2 Path Update
**Location:** Lines 159-164

```typescript
const scriptKey =
  versionId === "latest"
    ? `${userId}/${projectId}/${deviceId}/latest.js`
    : `${userId}/${projectId}/${deviceId}/${versionId}.js`;
```

Correctly updated to use new per-device R2 path structure.

### `deviceSender.ts`
- Minor formatting changes (type parameter formatting)
- No functional changes - looks good

---

## Missing Items (Per Phase 5 in Spec)

These are not in the commit but noted as pending:

- [ ] Integration tests for full CLI workflow
- [ ] OpenAPI spec update (`openapi.json`)
- [ ] Data migration script for existing projects
- [ ] Update `templates/README.md` with new API docs
- [ ] Remove deprecated code

---

## Security Considerations

1. **Good:** All endpoints check for authenticated user
2. **Good:** Project ownership validated before device operations
3. **Concern:** `downloadFirmware.ts` doesn't validate ownership
4. **Concern:** `/test` endpoint exposes env variable names

---

## Performance Considerations

1. **Batch Upload:** Each device processed sequentially - could be parallelized

---

## Testing Recommendations

When implementing tests (Phase 5), focus on:

1. **Device CRUD:** Create, read, update, delete flows
2. **Script versioning:** Upload, list versions, deploy (rollback)
3. **Batch upload:** Success case, partial failure, validation errors
4. **Edge cases:**
   - Duplicate device_id within project
   - Invalid slug formats
   - Non-existent projects/devices
   - Script validation failures
5. **Cascading deletes:** Verify R2 cleanup

---

## Conclusion

The refactor is well-structured and implements most of the spec correctly. The main concerns are:

1. **Missing endpoint:** `scripts-version-get`
4. **Security:** `downloadFirmware.ts` ownership check

Overall, this is a solid implementation that follows good patterns. Addressing the medium-priority issues before production deployment is recommended.
