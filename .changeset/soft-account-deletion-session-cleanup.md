---
"@devicesdk/api": minor
---

Add soft account deletion with 7-day grace period and hourly session cleanup cron. Users can request account deletion via DELETE /v1/user/me, which sets a grace period and immediately revokes all sessions. Auth is refused for pending-deletion accounts. A scheduled handler purges expired accounts, sessions, rate limits, and CLI auth codes.
