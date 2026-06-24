---
title: Rate Limits
description: The auth brute-force rate limits on a self-hosted DeviceSDK server
social_image: /og-images/docs/concepts/rate-limits.png
---

DeviceSDK is self-hosted: you run the server, so there are **no plan tiers, no per-message
quotas, and no usage billing**. The only rate limiting the server applies is **brute-force
protection on authentication endpoints**, to slow password and token-guessing attacks.

Everything else - how many devices you connect, how many messages they send, how often your
scripts run - is bounded only by the hardware you run the server on.

## Authentication rate limits

The server keeps an in-memory, per-IP, fixed-window limiter on the auth routes. Requests
that exceed the window receive an HTTP `429 Too Many Requests` response.

| Endpoint | Limit |
|----------|-------|
| Register (`/v1/auth/register`) | 10 per minute |
| Login (`/v1/auth/login`) | 20 per minute |
| CLI start auth (`/v1/cli/auth/start`) | 10 per minute |
| CLI poll auth (`/v1/cli/auth/poll`) | 60 per minute |
| CLI refresh token (`/v1/cli/auth/refresh`) | 10 per minute |

The limiter is keyed by client IP and request path. Behind a reverse proxy, the server reads
the standard `X-Forwarded-For` / `X-Real-IP` headers to identify the real client - make sure
your proxy sets them.

## Handling 429 responses

When you hit an auth limit, the response includes a `Retry-After` header indicating how many
seconds to wait before retrying:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 12
Content-Type: application/json

{
  "success": false,
  "error": "Rate limit exceeded. Try again shortly."
}
```

Wait for the duration in `Retry-After` before sending another request.

## Deployment limits

Script deployments have one hard constraint:

- **Maximum script size**: 1 MB per version

These are not rate limits - there's no cap on how frequently you deploy to your own server.
