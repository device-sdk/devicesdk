---
"@devicesdk/api": patch
---

Fix device and project slug validation to prevent unhandled ZodError rejections in Zod v4

Move slug format validation from the Zod schema `.regex()` call into the request handler for `createDevice` and `createProject`. This matches the pattern already used in `batchUpload` and prevents a Zod v4 async validation bug from leaking unhandled promise rejections that caused the test runner to exit with code 1. Also unskips the previously-disabled `should return 400 if project_slug is invalid format` test and adds equivalent 400 validation tests for `createDevice`.
