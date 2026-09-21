# Hijpass configuration generator

This directory replaces the former TypeScript core builders. It uses native core
configuration structs and requires Go 1.26 or newer. It runs on demand; it is not
a daemon.

## Pinned upstream schemas

The latest stable releases checked on 2026-09-21 are pinned in `go.mod`/`go.sum`:

- [Xray v26.3.27](https://github.com/XTLS/Xray-core/releases/tag/v26.3.27):
  `github.com/xtls/xray-core v1.260327.0` (the Go module version for the release
  commit `d2758a023cd7f4174a5a5fa4ff66e487d4342ba0`). Builders use
  [`infra/conf`](https://github.com/XTLS/Xray-core/tree/v26.3.27/infra/conf).
- [sing-box v1.14.1](https://github.com/SagerNet/sing-box/releases/tag/v1.14.1):
  `github.com/sagernet/sing-box v1.14.1`. Builders use
  [`option`](https://github.com/SagerNet/sing-box/tree/v1.14.1/option) and the
  context-aware `sing/common/json` serializer for polymorphic options.

`proxyNode` decodes UCI strings into typed fields once. Core output, DNS, routing,
transports and protocol settings use upstream structs. Xray exposes protocol
settings and routing rules as `json.RawMessage`; typed settings are serialized
only at these boundaries. Its private field-rule, least-load and health-check
structs have small local wire adapters. The health-check adapter is decoded into
native `BurstObservatoryConfig` before output. Maps remain for raw UCI sections,
section/tag indexes and keyed RPC method descriptions, not core schemas.

Native imports bring transitive core dependencies and a larger generator binary;
this is no longer a standard-library-only build. Stripped static smoke builds
were approximately 30 MiB (ARM64) and 34 MiB (MIPSLE), before package compression.
The SDK must supply Go 1.26+.
The installed runtime cores should match these pinned releases; older-core
compatibility is not promised. Core binaries still perform final validation.

Schema corrections relative to the former browser generator:

- sing-box uses reject rule actions instead of its removed block outbound,
  supplies a local default domain resolver for proxy nodes, and supplies uTLS
  when Reality is enabled. See the upstream
  [migration guide](https://sing-box.sagernet.org/migration/).
- Xray DNS outbound uses the release's `nonIPQuery: "reject"`, and route port
  ranges use `-`. See the pinned
  [DNS options](https://github.com/XTLS/Xray-core/blob/v26.3.27/infra/conf/dns_proxy.go)
  and [routing parser](https://github.com/XTLS/Xray-core/blob/v26.3.27/infra/conf/router.go).
- Geo conversion preserves explicit rule-set references alongside derived Geo
  rule-sets. Typed numbers reject overflow and invalid UCI numeric values.

Native serializers can omit default values, collapse single-item lists and
normalize durations. JSON formatting/shape differences do not imply lost options.

## Responsibilities

- LuCI edits `/etc/config/hijpass` through the existing UCI session, user rule
  files, and explicitly custom configurations. Frontend validation remains for
  immediate feedback, but runtime generation does not depend on it.
- `hijpass-config` renders enabled proxy nodes and template shunt configurations,
  including protocol options, upstream SOCKS chains, load balancing, DNS,
  ordered routing, IPv4/IPv6 variants and Geo conversion metadata.
- The existing Shell services still manage procd, DNS and nftables.

`generate` reads UCI through `ubus call uci get` without a browser session.
Like the init script, this includes command-line UCI deltas in `/tmp/.uci`, but
excludes isolated browser drafts. Commit CLI edits before rebooting.
It preserves section order using `.index`. It resolves chained node dial addresses
without modifying their TLS/Reality settings, converts Geo files, then validates
staged JSON using `sing-box check` / `xray run -test`. Xray validation uses
`XRAY_LOCATION_ASSET=/usr/share/v2ray`.

Every output is staged before publishing; generated configurations have mode 0600.
The generator serializes writers with flock, rejects non-regular destinations,
and restores previous files if an ordinary publication I/O error occurs. Multiple
renames are **not a power-loss transaction**. Services start only after publication.
Custom configurations are neither generated nor validated by this program.

`restart` and `reload` generate before stopping existing services. Direct `start`
also generates. Native-core failures appear in the Hijpass log; LuCI's UCI Apply
confirmation does not certify that the new core instances started successfully.
A failed generation leaves the saved UCI as-is, so fix it before the next reboot.

## Interfaces

The installed binary is `/usr/bin/hijpass-config`; rpcd discovers the same binary
through `/usr/libexec/rpcd/hijpass-config`.

| Entry point | Input | Result / side effects |
| --- | --- | --- |
| `generate` | system UCI | validate and publish runtime files |
| `render` | JSON array of UCI sections on stdin | JSON `{nodes, shunt}` on stdout, no writes |
| `list` | none | rpcd method schema |
| `call validate` | `{sections: "JSON array"}` on stdin | `{ok: true}` or `{error: string}` |
| `call render` | `{sections: "JSON array", target: "section-id"}` | `{config: object}` or `{error: string}` |

The RPC render target `shunt` previews template routing. An empty target returns
all generated objects. Section IDs and types use LuCI's `.name` / `.type` keys;
options must be strings or string lists. Inputs are limited to 4 MiB. RPC methods
are read-only and cannot execute `generate` or publish client-supplied paths.
They require the existing Hijpass **write** ACL because previews contain secrets.
RPC validation checks the submitted snapshot's structure and references; native
core validation and network resolution happen during service generation.

Generated metadata:

- `/etc/hijpass/generated-georules.json`: derived lists for `geoview.sh`; the Go
  backend no longer edits `geosite_ruleset` / `geoip_ruleset` in user UCI.
- `/etc/hijpass/generated-files.json`: known generated client files. After a
  successful publish, stale files in the current client directory are removed.
  Files still referenced by any node, including custom nodes, are retained.
  Existing pre-migration files and files in an old custom directory are not
  guessed at or deleted.

The initial migration keeps existing configured paths and custom files. No config
schema conversion is needed. Install both packages together; the LuCI post-install
hook reloads rpcd. Before installation, back up `/etc/config/hijpass` and custom
files as for other application upgrades.

## Verification

From the repository root:

```sh
(cd go-src && go test -race ./... && go vet ./...)
node --test ts-src/tests/*.test.cjs
ts-src/node_modules/.bin/tsc --project ts-src/tsconfig.json
(cd ts-src && npm run build)
```

`testdata/compatibility.json` contains 49 immutable output samples captured from the
former browser generator at commit
`bca34e5285fd8edd7da6cb2fd23e499e68c9f502`. Fixtures use synthetic credentials.
Tests apply the explicitly listed schema migrations to those old samples, then
use native parsers/serializers to compare both sides. They also exercise Xray's
native `Build`, numeric bounds, TLS preservation during address replacement,
Geo rule-set preservation and removed outbound handling.

During this refactor, official Linux AMD64 binaries for the pinned releases also
accepted 45 generated configurations covering default protocols, VLESS transports,
load balancing, chains and shunt/DNS rules. These were configuration checks, not
live connectivity tests. The all-options fixtures contain intentionally synthetic
Reality keys and incompatible option combinations; Geo/remote rule-set fixtures
need external resources and were excluded from that binary smoke check.
To reproduce them with that commit available in Git history:

```sh
node ts-src/tests/generate-go-fixtures.cjs
```

Additional tests exercise RPC boundaries, LuCI snapshot/error handling, service
restart ordering, dependency failures, custom config preservation, file permissions
and failed publication preparation. These checks do not replace an OpenWrt SDK
build or on-device connectivity tests with the installed proxy cores.

For cross-compilation without an SDK (binary smoke check only):

```sh
cd go-src
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o /tmp/hijpass-config-arm64 .
CGO_ENABLED=0 GOOS=linux GOARCH=mipsle GOMIPS=softfloat go build -o /tmp/hijpass-config-mipsle .
```

The root package Makefile uses OpenWrt's Go toolchain and emits an architecture
specific `hijpass-config` package alongside the architecture independent LuCI
package. A full package build still requires the OpenWrt source tree or SDK.
