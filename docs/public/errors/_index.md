---
title: Error reference
description: Stable error codes returned by the DeviceSDK API and CLI
weight: 100
social_image: /og-images/docs/errors.png
---

DeviceSDK API responses use a `{ success: false, error, code, docs }` shape on every error path. The `code` is a stable identifier suitable for `===` comparison; the `docs` URL points to a page on this site explaining the error and the most common fix.

The CLI surfaces the same fields on `DeviceSDKApiError` instances:

```typescript
import { DeviceSDKApiError } from "@devicesdk/cli";
try { /* ... */ }
catch (err) {
  if (err instanceof DeviceSDKApiError) {
    console.error(err.message);
    if (err.code === "invalid_token") await login();
    if (err.docs) console.error(`See ${err.docs}`);
  }
}
```

## Error codes

- [`missing_credentials`](./missing_credentials/) — no Bearer token, session cookie, or CLI token on the request
- [`invalid_token`](./invalid_token/) — token does not match any active session/API/legacy entry
- [`invalid_cli_token`](./invalid_cli_token/) — CLI token (`dsdk_*`) is missing, expired, or revoked
- [`account_suspended`](./account_suspended/) — user account has been suspended
- [`account_deletion_pending`](./account_deletion_pending/) — user requested account deletion; request hasn't elapsed yet

If you hit an error code that isn't listed here, please [open an issue](https://github.com/device-sdk/devicesdk-monorepo/issues) so we can document it.
