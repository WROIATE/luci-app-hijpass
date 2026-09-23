# Hijpass configuration generator

This directory replaces the former TypeScript core builders. It uses native core
configuration structs and requires Go 1.27 or newer. It runs on demand; it is not
a daemon.

## Pinned upstream schemas

The dependency policy is Xray's current `main` source and sing-box's stable
release, both pinned in `go.mod`/`go.sum` for reproducible builds:

- [Xray main at `d562d8947d31`](https://github.com/XTLS/Xray-core/commit/d562d8947d3175db86b4fa849742433a9876cb63):
  checked on 2026-09-22; upstream commit dated 2026-09-20.
  `github.com/xtls/xray-core v1.260327.1-0.20260920225103-d562d8947d31` is the
  Go pseudo-version for this commit, **not the March release**. Builders use
  [`infra/conf`](https://github.com/XTLS/Xray-core/tree/d562d8947d3175db86b4fa849742433a9876cb63/infra/conf).
  Future updates should resolve `main` again and commit the resulting exact
  version together with schema adaptations and test results.
- [sing-box v1.14.1](https://github.com/SagerNet/sing-box/releases/tag/v1.14.1):
  `github.com/sagernet/sing-box v1.14.1`. Builders use
  [`option`](https://github.com/SagerNet/sing-box/tree/v1.14.1/option) and the
  context-aware `sing/common/json` serializer for polymorphic options.

## Package boundaries

- `protocol/` owns the `Node` / `RemoteNode` interfaces, concrete models,
  defaults and value constraints. Fields use `int64`, `bool`, `float64`,
  `time.Duration`, `[]string` and optional pointers. It has no UCI field mappings,
  JSON tags, JSON decoding methods or dependency on input adapters or cores.
  `protocol.New` creates a concrete node with defaults; `protocol.Validate`
  checks common and protocol-specific constraints after fields are filled.
- `uci/` is the input adapter. `DecodeNode` selects the model using UCI `type`,
  maps flat option names to model fields, and converts UCI strings and lists.
  Its private wire types never escape into protocol models. Missing fields keep
  defaults; explicit zero/false values override defaults; stale fields belonging
  to other protocols are ignored. Conversion errors identify the UCI option.
- The application coordinates section lookup and core-name normalization in
  `node.go`; `xray_proxy.go` and `singbox_proxy.go` convert protocol models into
  the corresponding upstream configuration structs.

Dependencies point from `uci` and core builders **to** `protocol`; the protocol
package can be used without either input format or core implementation.
Each protocol retains its own file (`shadowsocks.go`, `hysteria2.go`, `tuic.go`,
`shadowtls.go`, `vless.go`, `load_balance.go`). Shared capabilities are embedded
only where supported: Reality belongs to VLESS; load balancers do not implement
`RemoteNode` or carry server/TLS credentials.

This separation is a project design choice. References: Go's
[package organization](https://go.dev/doc/modules/layout),
[interfaces](https://go.dev/ref/spec#Interface_types), and
[RawMessage](https://pkg.go.dev/encoding/json#RawMessage), which lets the input
adapter delay decoding until the relevant protocol is known.

UCI strings are decoded into typed fields once. Core output, DNS, routing,
transports and protocol settings use upstream structs. Xray exposes protocol
settings and routing rules as `json.RawMessage`; typed settings are serialized
only at these boundaries. Its private field-rule, least-load and health-check
structs have small local wire adapters. The health-check adapter is decoded into
native `BurstObservatoryConfig` before output. Maps remain for raw UCI sections,
section/tag indexes and keyed RPC method descriptions, not core schemas.

Native imports bring transitive core dependencies and a larger generator binary;
this is no longer a standard-library-only build. Stripped static smoke builds for
this revision are approximately 32 MiB (ARM64) and 36 MiB (MIPSLE), before package
compression; exact sizes vary by upstream revision.
The SDK must supply Go 1.27+.
The installed runtime cores should match these pinned revisions; older-core
compatibility is not promised. Core binaries still perform final validation.

Schema corrections relative to the former browser generator:

- sing-box uses reject rule actions instead of its removed block outbound,
  supplies a local default domain resolver for proxy nodes, and supplies uTLS
  when Reality is enabled. See the upstream
  [migration guide](https://sing-box.sagernet.org/migration/).
- Xray DNS outbound uses native `rules`: hijack A/AAAA (types 1 and 28), then
  return REFUSED (rcode 5) for other queries. Deprecated `nonIPQuery`/`blockTypes`
  are unset. Route port ranges use `-`. See the pinned
  [DNS options](https://github.com/XTLS/Xray-core/blob/d562d8947d3175db86b4fa849742433a9876cb63/infra/conf/dns_proxy.go)
  and [routing parser](https://github.com/XTLS/Xray-core/blob/d562d8947d3175db86b4fa849742433a9876cb63/infra/conf/router.go).
- Xray main no longer has Shadowsocks `uot`/`uotVersion`. An enabled UCI
  `udp_over_tcp` on Xray Shadowsocks produces an explicit error; disable it or
  use sing-box. See the pinned
  [Shadowsocks schema](https://github.com/XTLS/Xray-core/blob/d562d8947d3175db86b4fa849742433a9876cb63/infra/conf/shadowsocks.go).
- Xray's native build now rejects public-address VLESS without TLS or encryption.
  The generator keeps the requested security settings; final core validation
  enforces that upstream restriction. Freedom's domain strategy is generated as
  `streamSettings.sockopt.domainStrategy`, replacing its deprecated settings field.
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
The Xray Shadowsocks UoT sample must first return an explicit error; its remaining
options are then compared with UoT disabled. For all 49 samples, tests apply the
explicitly listed schema migrations, then
use native parsers/serializers to compare both sides. They also exercise Xray's
native `Build`, numeric bounds, TLS preservation during address replacement,
Geo rule-set preservation and removed outbound handling. Native tests also check
Xray main's public plaintext VLESS rejection and DNS rules after protobuf build.

The current Xray revision is checked through its native configuration parser and
`Build` implementation, including the DNS rules' resulting protobuf policy.
Go race tests, `go vet`, the five backend/LuCI integration tests and static
ARM64/MIPSLE cross-compilation passed with Go 1.27.1.
All-options fixtures contain synthetic Reality keys and incompatible option
combinations, so schema comparisons alone do not certify runtime connectivity.
Geo and remote rule-set configurations also require external resource files.

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
