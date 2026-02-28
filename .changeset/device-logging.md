---
"@devicesdk/api": minor
"@devicesdk/core": patch
"@devicesdk/cli": patch
"@devicesdk/dashboard": minor
---

Add device logging pipeline: console.log/info/warn/error/debug in user device scripts are automatically persisted to per-device DO SQLite storage, served via GET /v1/.../logs endpoint, and displayed in dashboard Logs tab
