# Plan 009: Advertise DNS-SD (`_devicesdk._tcp`) and browse for servers in the CLI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md` - unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bbd724d..HEAD -- apps/server/src/foundation/mdns packages/cli/src/api apps/server/src/server.ts apps/server/src/config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2 (execute BEFORE plan 001 if possible - see Maintenance notes)
- **Effort**: S-M
- **Risk**: LOW (additive protocol surface; existing A-record path untouched)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `bbd724d`, 2026-07-06

## Why this matters

The server's mDNS responder only answers A-record queries for one fixed name
(`<MDNS_HOSTNAME>.local`), so the CLI's "auto-discovery" is really "resolve
`devicesdk.local` and hope": a custom `MDNS_HOSTNAME`, a non-8080 `PORT`, or
two servers on one LAN all break discovery unless the user already knows the
answer. DNS-SD (RFC 6763) service advertisement (`_devicesdk._tcp.local`) lets
clients *browse* for every DeviceSDK server on the network and learn each one's
real hostname AND port from the SRV record. It also unlocks zeroconf discovery
in the planned Home Assistant integration (plan 001) - HA shows a "DeviceSDK
discovered" flow automatically for any integration that advertises a service
type. This is a ROADMAP.md item ("full DNS-SD service-type advertisement
(`_devicesdk._tcp`) so the CLI and the HA integration can browse for servers").

## Current state

Relevant files:

- `apps/server/src/foundation/mdns/dnsPacket.ts` (193 lines) - pure DNS wire
  codec. Exports `TYPE_A = 1`, `TYPE_ANY = 255`, `CLASS_IN`, `FLAG_TOP_BIT`,
  `parseQuery()`, `encodeAResponse()`, `encodeName()`, `parseIpv4()`. Encodes
  ONLY A-record responses today. No name compression is emitted (fine - keep it
  that way; packets stay small).
- `apps/server/src/foundation/mdns/responder.ts` (143 lines) - socket wrapper.
  `buildResponseForQuery(packet, fqdn, addresses)` is the pure decision core;
  `startMdnsResponder({hostname, port?, getAddresses?})` binds UDP 5353, joins
  `224.0.0.251`, replies **unicast to the querier**, and multicasts a gratuitous
  announcement on start and a TTL-0 goodbye on stop.
- `apps/server/src/foundation/mdns/dnsPacket.test.ts`,
  `apps/server/src/foundation/mdns/responder.test.ts` - bun tests; the exemplar
  patterns to extend (`describe`/`it`, pure-function tests plus socket tests
  with an injectable port).
- `apps/server/src/server.ts` lines 76-90 - wiring:

  ```ts
  const mdns = config.mdnsEnabled
      ? startMdnsResponder({ hostname: config.mdnsHostname })
      : null;
  ```

- `apps/server/src/config.ts` lines 76, 83-84 - `port` (from `PORT`, default
  8080), `mdnsEnabled` (`MDNS_ENABLED`, default true), `mdnsHostname`
  (`MDNS_HOSTNAME`, default `"devicesdk"`).
- `packages/cli/src/api/mdnsDiscovery.ts` (235 lines) - the CLI's own zero-dep
  mDNS client. `discoverMdnsHost()` sends one A query for
  `<DEVICESDK_MDNS_HOSTNAME|devicesdk>.local` and resolves
  `http://<first-ip>:<DEVICESDK_MDNS_PORT|8080>` or `null` on timeout (1500 ms).
  It duplicates `encodeName`/`readName` from the server codec (intentional -
  the CLI must not depend on server code).
- `packages/cli/src/api/shared.ts` lines 45-73 - `getApiUrl()` calls
  `discoverMdnsHost()` as the last-resort host resolution and prints
  `✓ Discovered DeviceSDK server at <url> via mDNS.`
- `packages/cli/src/api/mdnsDiscovery.test.ts` - vitest suite; exemplar for the
  new browse tests (it drives `parseAResponses` with hand-built packets and
  `discoverMdnsHost` against a fake socket).

Key wire facts already in the codebase you must stay consistent with:

- Answers set the cache-flush bit (`FLAG_TOP_BIT` on rrclass) - correct for
  *unique* records (A, SRV, TXT) but **must NOT be set on PTR records**, which
  are shared (RFC 6762 §10.2).
- The responder replies unicast to `rinfo.address:rinfo.port`. That is correct
  for legacy/one-shot resolvers (source port ≠ 5353) but standard mDNS
  responses to queries from source port 5353 should go to the multicast group
  `224.0.0.251:5353` so all caches (including Home Assistant's zeroconf) see
  them. This plan adds that distinction.

Repo conventions: strict TS, no `any` (use `unknown` + narrowing), zero new
dependencies in both packages (both codecs are deliberately hand-rolled), files
under ~700 LOC, server tests are `bun test`, CLI tests are vitest.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `pnpm install` | exit 0 |
| Server tests | `pnpm test --filter @devicesdk/server` | all pass |
| CLI tests | `pnpm test --filter @devicesdk/cli` | all pass |
| Server types | `pnpm check-types --filter @devicesdk/server` | exit 0 |
| Server lint | `pnpm lint --filter @devicesdk/server` | exit 0 |
| Repo lint (pre-commit) | `pnpm lint` | exit 0 |
| Changeset | `pnpm changeset` | interactive; see Step 7 |

## Scope

**In scope** (the only files you should modify or create):

- `apps/server/src/foundation/mdns/dnsPacket.ts`
- `apps/server/src/foundation/mdns/dnsPacket.test.ts`
- `apps/server/src/foundation/mdns/responder.ts`
- `apps/server/src/foundation/mdns/responder.test.ts`
- `apps/server/src/server.ts` (one-line wiring change only)
- `packages/cli/src/api/mdnsDiscovery.ts`
- `packages/cli/src/api/mdnsDiscovery.test.ts`
- `packages/cli/src/api/shared.ts` (discovery call site only)
- `README.md` (mDNS paragraph), `ROADMAP.md` (mark DNS-SD shipped)
- `.changeset/*.md` (new changeset)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- Firmware mDNS resolution (`firmware/*`) - devices resolve the A record via
  lwIP; nothing changes for them.
- `apps/server/src/config.ts` - no new env vars are needed; the service uses
  the existing `mdnsHostname` and `port`.
- Interactive server-picker UI in `devicesdk login` when several servers are
  found - deferred (see Maintenance notes). Print the list and use the first.
- The Home Assistant integration (plan 001) - only a maintenance note links
  them.
- Any change to `encodeAResponse`'s existing behavior consumed by tests.

## Git workflow

- `git worktree add .worktrees/dns-sd-discovery -b dns-sd-discovery` and work
  only inside that worktree (repo rule: never work in the main checkout).
- Conventional commits, e.g. `feat(server): advertise _devicesdk._tcp over
  DNS-SD` / `feat(cli): browse for servers via DNS-SD`.
- Run `pnpm lint` before every commit.
- Open a PR into `main` only if `origin` points at
  `github.com/device-sdk/devicesdk`; otherwise report and ask.

## Steps

### Step 1: Extend the server DNS codec with PTR/SRV/TXT encoding

In `apps/server/src/foundation/mdns/dnsPacket.ts`:

1. Add constants: `TYPE_PTR = 12`, `TYPE_TXT = 16`, `TYPE_SRV = 33`.
2. Add a generic record encoder alongside (not replacing) `encodeAResponse`:

   ```ts
   export interface DnsRecord {
       name: string;          // dotted name
       type: number;          // TYPE_A | TYPE_PTR | TYPE_TXT | TYPE_SRV
       ttl: number;
       cacheFlush: boolean;   // FLAG_TOP_BIT on rrclass when true
       rdata: Uint8Array;
   }
   export function encodeResponse(records: DnsRecord[], id?: number): Uint8Array
   ```

   Header: `id ?? 0`, flags `0x8400`, QDCOUNT 0, ANCOUNT `records.length`,
   NSCOUNT 0, ARCOUNT 0. (Putting SRV/TXT/A in the answer section instead of
   additionals is valid and simpler; browsers accept it.)
3. Add rdata builders (all using the existing `encodeName`, no compression):
   - `encodePtrRdata(target: string)` → encoded name.
   - `encodeSrvRdata(port: number, target: string)` → `u16 priority=0,
     u16 weight=0, u16 port, name target`.
   - `encodeTxtRdata(pairs: string[])` → each string length-prefixed (1 byte)
     and concatenated; for an empty list emit a single zero byte (RFC 6763
     §6.1 requires at least one byte).
4. Reimplement `encodeAResponse` on top of `encodeResponse` +
   `encodeARdata(addr)` (via existing `parseIpv4`) so there is one encode path.
   Its output bytes must stay identical - the existing tests pin it.

**Verify**: `pnpm test --filter @devicesdk/server` → all existing dnsPacket
tests still pass (byte-identical A responses), plus your new codec tests
(Step 6) once written.

### Step 2: Answer DNS-SD queries in the responder

In `apps/server/src/foundation/mdns/responder.ts`:

1. Add a required `servicePort: number` to `StartMdnsOptions` (the HTTP port
   the SRV record advertises).
2. Define names (all lowercase comparisons, as today):
   - host: `<hostname>.local` (existing `fqdn`)
   - service type: `_devicesdk._tcp.local`
   - instance: `<hostname>._devicesdk._tcp.local`
   - meta-service: `_services._dns-sd._udp.local`
3. Extend the pure core. Replace `buildResponseForQuery(packet, fqdn,
   addresses)` with `buildResponseForQuery(packet, fqdn, addresses,
   servicePort)` returning `Uint8Array | null` as before. Answer matrix
   (union all matching records into ONE response packet, dedupe):
   - Q `<hostname>.local` type A/ANY → A record per address
     (`cacheFlush: true`, TTL 120). [existing behavior]
   - Q `_devicesdk._tcp.local` type PTR/ANY → PTR `_devicesdk._tcp.local` →
     instance (`cacheFlush: false`, TTL 4500) **plus** SRV + TXT for the
     instance and A records (all `cacheFlush: true`; SRV/TXT TTL 120), so
     browsers resolve in one round trip.
   - Q `<hostname>._devicesdk._tcp.local` type SRV/TXT/ANY → SRV + TXT
     (+ A records for the SRV target).
   - Q `_services._dns-sd._udp.local` type PTR/ANY → PTR to
     `_devicesdk._tcp.local` (`cacheFlush: false`, TTL 4500).
   - SRV: port = `servicePort`, target = `<hostname>.local`.
   - TXT: exactly `["txtvers=1"]` for now.
4. Response routing in the socket handler: if `rinfo.port === MDNS_PORT`
   (5353), send the response to `MDNS_ADDRESS:MDNS_PORT` (multicast) with
   id 0; otherwise keep today's unicast reply to the querier echoing the query
   id. Implement by having `buildResponseForQuery` keep echoing the parsed id
   and the caller override destination; the pure core does not need to know.
5. Include PTR (service + meta) + SRV + TXT + A in the gratuitous `announce()`
   on start, and in the TTL-0 goodbye on `stop()` (set every record's TTL to
   0, including the PTR ones).

Do NOT implement probing, conflict resolution, or known-answer suppression -
the module deliberately skips them for the A record already; keep parity and
note it in the module header comment.

**Verify**: `pnpm test --filter @devicesdk/server` → responder tests pass.

### Step 3: Wire the port in server boot

`apps/server/src/server.ts`: pass `servicePort: config.port` to
`startMdnsResponder`.

**Verify**: `pnpm check-types --filter @devicesdk/server` → exit 0.

### Step 4: Add DNS-SD browsing to the CLI

In `packages/cli/src/api/mdnsDiscovery.ts` (keep it dependency-free; extend the
local codec, do not import server code):

1. Add parsing for answer records beyond A: walk answers + additionals reading
   (name, type, class, ttl, rdlength, rdata); decode PTR rdata (name), SRV
   rdata (skip 4 bytes, u16 port, name target - note SRV targets may use
   compression pointers, and `readName` already follows pointers), and A rdata.
2. Add:

   ```ts
   export interface DiscoveredServer {
       instance: string;   // e.g. "devicesdk._devicesdk._tcp.local"
       host: string;       // SRV target, e.g. "devicesdk.local"
       port: number;       // SRV port
       addresses: string[];// A records seen for the target (may be empty)
       url: string;        // http://<address|host>:<port>
   }
   export async function browseMdnsServers(options?: {
       timeoutMs?: number;  // full collection window, default 1500
   }): Promise<DiscoveredServer[]>
   ```

   Send one PTR query for `_devicesdk._tcp.local`, then collect responses for
   the whole window (do NOT resolve on first answer - multiple servers answer
   independently). Dedupe by instance name. Build `url` from the first A
   address if present, else the SRV target name. Prefer the address: not all
   stub resolvers handle `.local`.
3. Update `discoverMdnsHost()`: browse first; if the browse returns ≥1 server,
   return the first server's `url` (and when >1, the caller prints all - see
   next point). If the browse returns none (older server without DNS-SD), fall
   back to the existing A-query path unchanged.
4. In `packages/cli/src/api/shared.ts` `getApiUrl()`: when discovery was used
   and more than one server was found, print each discovered `instance` +
   `url` to stderr and note `Use devicesdk login --host <url> to pin one.`
   Keep the existing single-server message otherwise. To surface the list,
   have `discoverMdnsHost` accept an optional `onMultiple` callback or export
   the browse and call it from `shared.ts` - pick one, keep `discoverMdnsHost`'s
   public signature backward compatible (it has tests).

**Verify**: `pnpm test --filter @devicesdk/cli` → all pass.

### Step 5: Server tests

Extend `dnsPacket.test.ts` (model after the existing `describe` blocks):

- `encodeSrvRdata` / `encodeTxtRdata` / `encodePtrRdata` byte layouts
  (hand-computed expected arrays, as the existing tests do).
- `encodeResponse` header fields and a multi-record packet.
- `encodeAResponse` output is byte-identical to the pre-change fixture.

Extend `responder.test.ts` (`buildResponseForQuery` is pure - no sockets
needed):

- PTR query for `_devicesdk._tcp.local` → response contains PTR (no
  cache-flush bit) + SRV with the configured port + TXT `txtvers=1` + A.
- SRV query for the instance name → SRV + TXT + A.
- Meta-query `_services._dns-sd._udp.local` → PTR to the service type.
- Case-insensitivity (query in mixed case).
- Unrelated service type query → `null`.

### Step 6: CLI tests

Extend `packages/cli/src/api/mdnsDiscovery.test.ts` (vitest, model after the
existing packet-fixture style):

- Parsing a hand-built DNS-SD response (PTR + SRV + TXT + A, including a
  compression pointer in the SRV target) into a `DiscoveredServer`.
- Two servers answering → two deduped entries, stable order.
- Browse timeout with no answers → `[]`, and `discoverMdnsHost` falls back to
  the legacy A query.

### Step 7: Docs + changeset

- `README.md`: extend the mDNS paragraph (currently "The server also
  advertises itself over **mDNS** as `devicesdk.local`...") to mention DNS-SD
  browsing and that the CLI now finds servers with custom names/ports.
- `ROADMAP.md`: under "Discovery & onboarding", mark the DNS-SD item shipped
  (follow the existing "_shipped:_" phrasing used for mDNS advertisement).
- `pnpm changeset`: minor for `@devicesdk/cli`, patch (or minor) for
  `@devicesdk/server`. Message: server advertises `_devicesdk._tcp` via
  DNS-SD; CLI browses for servers (custom `MDNS_HOSTNAME`/`PORT` setups are
  now discoverable).

**Verify**: `pnpm lint` → exit 0.

## Test plan

Covered by Steps 5-6. Full gate:

- `pnpm test --filter @devicesdk/server` → all pass, including new dnsPacket
  and responder cases.
- `pnpm test --filter @devicesdk/cli` → all pass, including browse cases.

Optional live check (nice, not required): `pnpm dev --filter
@devicesdk/server` on a machine with avahi, then
`avahi-browse -r _devicesdk._tcp` → one entry with port 8080 and TXT
`txtvers=1`.

## Done criteria

- [ ] `pnpm check-types --filter @devicesdk/server` exits 0
- [ ] `pnpm test --filter @devicesdk/server` exits 0 with new DNS-SD tests
- [ ] `pnpm test --filter @devicesdk/cli` exits 0 with new browse tests
- [ ] `pnpm lint` exits 0
- [ ] `grep -n "TYPE_SRV" apps/server/src/foundation/mdns/dnsPacket.ts` matches
- [ ] `grep -n "browseMdnsServers" packages/cli/src/api/mdnsDiscovery.ts` matches
- [ ] A changeset exists referencing `@devicesdk/server` and `@devicesdk/cli`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The mdns module files differ from the excerpts above (drift).
- Making `encodeAResponse` delegate to `encodeResponse` changes its output
  bytes and existing tests fail - do not "fix" the old tests; report.
- The CLI browse requires binding port 5353 exclusively on some platform to
  receive multicast responses and the fallback unicast path can't be made to
  work in tests - report the platform specifics instead of shipping a flaky
  discovery.
- You find yourself wanting to add an npm dependency (e.g. `bonjour`,
  `multicast-dns`) - forbidden; both codecs are deliberately zero-dep.

## Maintenance notes

- **Plan 001 (Home Assistant)**: once this lands, 001's config flow can add
  `zeroconf: ["_devicesdk._tcp.local."]` to `manifest.json` for automatic
  server discovery. Add that note to plan 001 when updating the index.
- **Plan 008 (TLS)**: after TLS-by-default lands, discovered URLs should be
  `https://` when the server is in TLS mode. A TXT key (e.g. `tls=1`) is the
  natural carrier - whoever lands second must reconcile (add the TXT key and
  have the CLI honor it).
- Deferred: interactive server picker in `devicesdk login` for multi-server
  LANs; IPv6 (AAAA) records; known-answer suppression.
- Reviewer attention: cache-flush bit must be absent on PTR records; multicast
  vs unicast reply routing (source port 5353 test); goodbye packet must
  include the PTR records with TTL 0.
