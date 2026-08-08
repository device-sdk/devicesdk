---
"@devicesdk/dashboard": patch
---

Fix device-switching and stream bugs:

- The live device stream now follows navigation between devices (previously it
  kept tailing the old device's socket) and dedupes replayed log entries on
  reconnect (duplicate keys were corrupting the log list)
- Navigating to another device resets the script editor, versions list, and
  dialogs - the previous device's script could be deployed by mistake
- A dead session (401 on the watch upgrade) now stops retrying and redirects
  to login instead of retrying forever
- API requests have timeouts (60s, 300s for uploads); the 401 redirect works
  on sub-path installs and timeouts are classified correctly on older browsers
- Create-token dialog awaits the clipboard write before claiming success;
  login/register surface the server's real error text; tokens and versions
  pages show load errors instead of a misleading empty state
- The router guard honors `?redirect_uri=` for already-authenticated users and
  no longer bounces to login on transient network errors
