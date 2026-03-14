---
"@devicesdk/api": patch
---

Fix R2 path mismatch in script upload endpoints that caused GET /script and GET /versions/:versionId to always return 404

Both `uploadScript` and `batchUpload` were writing script files to R2 using internal UUID-based paths (`{userId}/{project.id}/{device.id}/...`), while `getScript`, `getVersion`, and `deployVersion` read using slug-based URL params (`{userId}/{projectSlug}/{deviceSlug}/...`). This meant the reading endpoints could never locate uploaded scripts. Additionally, neither upload endpoint wrote a `latest.js` file, which `getScript` requires.
