---
'@devicesdk/dashboard': patch
---

Fix account page crash when user object is missing usage/limits after login. The auth store now fetches the full user profile after login/register so usage and limits fields are always populated.
