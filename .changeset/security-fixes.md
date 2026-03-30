---
"@devicesdk/api": patch
---

Fix critical and high security vulnerabilities: use cryptographically secure random for session and CLI auth tokens, hash API tokens before storage (SHA-256), fix CSRF cookie SameSite policy, invalidate sessions on logout, add rate limiting on auth endpoints, sanitize approval page HTML, strip error details in production, and restore Zod schema validators via chanfana safeParseAsync patch.
