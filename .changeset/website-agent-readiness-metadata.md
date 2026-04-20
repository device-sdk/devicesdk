---
"@devicesdk/website": patch
---

Publish agent-readiness metadata: `/.well-known/oauth-protected-resource` (RFC 9728) describing the API's bearer-token auth surface, an `oauth-protected-resource` Link header and api-catalog entry so agents can discover it, and a WebMCP `search_docs` tool (via `navigator.modelContext.provideContext`) that proxies to the existing docs AI-Search MCP instance.

OIDC discovery and an OAuth authorization-server metadata document are deliberately not published — DeviceSDK does not operate an OAuth authorization server, so advertising one would mislead agents.
