---
title: "Rate Limits"
description: "API rate limits by plan tier and how to handle 429 responses"
---

# Rate Limits

> API rate limits by plan tier and how to handle 429 responses


DeviceSDK enforces rate limits to ensure fair usage and platform stability. Limits vary by plan tier and are applied per-user for authenticated requests and per-IP for unauthenticated endpoints.

## API rate limits by plan

| Plan | Requests per minute |
|------|-------------------|
| Free | 60 |
| Paid | 120 |

These limits apply to all authenticated API endpoints. Requests exceeding the limit receive an HTTP `429 Too Many Requests` response.

## Handling 429 responses

When you hit a rate limit, the response includes a `Retry-After` header indicating how many seconds to wait before retrying:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 12
Content-Type: application/json

{
  "success": false,
  "error": "Rate limit exceeded. Try again in 12 seconds."
}
```

Wait for the duration specified in `Retry-After` before sending another request.

## CLI authentication endpoints

The CLI authentication flow has separate, stricter limits:

| Endpoint | Limit |
|----------|-------|
| Start auth (`/cli/auth/start`) | 10 per minute |
| Poll auth (`/cli/auth/poll`) | 60 per minute |
| Refresh token (`/cli/auth/refresh`) | 10 per minute |

These limits are per-IP and apply regardless of plan tier.

## Deployment limits

Script deployments have additional constraints:

- **Maximum script size**: 1 MB
- **Build timeout**: 5 minutes
- **Concurrent deployments**: 1 per project

