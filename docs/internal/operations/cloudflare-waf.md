---
social_image: /og-images/docs/internal/operations/cloudflare-waf.png
---
# Edge rate limiting (Cloudflare WAF)

> **Internal runbook.** Lives under `docs/internal/` and is **not** published to
> the public docs site. Cloudflare references are allowed here.

This is the **first layer of defense** against abusive request patterns on the
DeviceSDK API. Rules apply at the Cloudflare edge — blocked requests never
invoke a Worker, so they cost nothing on Workers/D1/DO quotas.

The rule below is the minimum we run. The block-list middleware
(`apps/api/src/foundation/userBlockList.ts`), per-user rate limiter on
`/logs`, and the deprecated `getLogs` DO RPC throw provide further defense
inside the Worker — see the comment block on `BaseDevice.getLogs` in
`apps/api/src/durableObjects/lib/device.ts` for the full incident write-up
that motivated all of this.

## Why this isn't IaC

The repo has no Terraform / Pulumi today. Adding a one-off `curl` script to
push WAF rules is brittle without a CI pipeline that owns API tokens. The
trade-off is: this rule is set in the Cloudflare dashboard once, manually,
and lives there. If the rule is ever removed accidentally, the symptom is
"runaway clients can burn the daily DO quota again" — not silent.

If we move to IaC later, the rule body documented below maps 1:1 to the
[Cloudflare Rate Limiting Rules API][rl-api].

## The rule

**Zone:** `api.devicesdk.com`
**Path:** Security → WAF → Rate limiting rules → New rule
**Rule name:** `api-edge-rate-limit`

| Field | Value |
| --- | --- |
| When incoming requests match | URI Path `contains` `/v1/` |
| Counting characteristics | IP address |
| Requests | `600` |
| Period | `10 seconds` (free plan max) |
| Action | `Block` |
| Response | Custom JSON, 429, body: `{ "success": false, "error": "Rate limited at edge.", "code": "EDGE_RATE_LIMIT" }` |

**Cap rationale.** 600 / 10 s ≈ 60 r/s per IP. A normal dashboard session
runs nowhere near that — the watcher WebSocket counts as a single upgrade —
so this rule never fires for legitimate traffic. The runaway pattern that
triggered the May 2026 incident was 0.5 r/s per IP from a single CLI; even a
broken client cluster can't reach 60 r/s without obvious abuse.

**Free plan note.** Free plan supports 1 rate-limit rule with a fixed 10 s
window. That is sufficient. Pro+ unlocks 60 s windows and additional rules;
if we upgrade, raise the period to `60 s` and the request count to `3600`
proportionally.

## Verifying the rule fires

After creating the rule, hammer the API from a single IP to trip it:

```bash
T=...    # any valid Bearer
P=...    # any project slug
D=...    # any device slug

for i in $(seq 1 700); do
  curl -s -o /dev/null -w "%{http_code} " \
    -H "Authorization: Bearer $T" \
    "https://api.devicesdk.com/v1/projects/$P/devices/$D/script" &
done
wait
```

You should see `200`s switch to `429`s once the 600/10 s threshold is
crossed. The 429 body is the custom JSON above. Confirm in
`Cloudflare → Security → Events` that the rule fired (filter by rule name
`api-edge-rate-limit`).

## When to relax it

If a legitimate large-scale operator (e.g. a fleet of N devices flashing
firmware in parallel against the public API) hits the rule, the **first**
move is **not** to relax this rule — it's to verify they aren't behind a
single egress IP. If they are and the traffic is legitimate, options:

1. Move them to dedicated infrastructure with its own zone settings.
2. Add an exception clause to the WAF rule (`AND ip.src not in {trusted}`).
3. Upgrade the zone to Pro+ and use a 60 s window with proportional limits.

[rl-api]: https://developers.cloudflare.com/waf/rate-limiting-rules/create-api/
