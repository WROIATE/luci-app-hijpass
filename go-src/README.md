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

The layout follows the responsibilities of the former TypeScript code (before
`f158dba`): `ts-src/core/{singbox,xray}` and `ts-src/utils/feature`. The existing
`ts-src/utils/actions` and Shell execution flow stay outside Go. Go directories
are real packages rather than visual file groups; see the [Go module layout guide](https://go.dev/doc/modules/layout).

```text
main.go, cli.go         executable entry point and command dispatch
rpc.go, input.go        read-only RPC and bounded JSON input
core/
  config.go             native config envelope, serialization, address replacement
  singbox/builder.go    sing-box proxy output and shared inbound/outbound builders
  xray/builder.go       Xray proxy output and shared inbound/outbound builders
feature/
  config.go             application config lookup and core selection
  node.go, proxy.go     protocol decoding and proxy dependency orchestration
  rules.go              routing rule interpretation
  shunt.go              shunt dependency and route orchestration
  shuntbuilder.go       DNS/routing assembly for shunts
  render.go             validation and whole-snapshot rendering
protocol/               protocol models, self-registration, UCI conversion, validation
uci/                    generic section access and typed UCI value decoding
```

The executable calls `feature`; features use the native core builders and
`protocol`. Builders receive a SOCKS-port resolver from the feature layer and
never import application orchestration. `protocol` depends on `uci`, which does
not import application, protocol or core types. The shared `core` package does
not import its child builder packages. Go does not load system UCI, execute shell
commands, resolve network addresses, convert Geo resources, publish files or
manage services.

Protocol interfaces live in `protocol/protocol.go`. Each concrete protocol keeps
its fields, defaults, `DecodeUCI` implementation and validation in its own file.
`protocol/options.go` contains only shared field conversions. Missing UCI options
preserve defaults and irrelevant protocol fields are ignored.

Tests reside with the responsibility they exercise: output compatibility and
native configuration checks in `feature`, decoding/registration in `protocol`,
and LuCI save/apply plus Shell integration under `ts-src/tests`. The shared compatibility
fixture stays in `testdata/` for both Go and frontend RPC tests. The OpenWrt
build copies all source packages; `go build .` still builds the executable from
the module root.

Ordinary source filenames have no underscores; test files retain `_test.go`.

### Adding a protocol

Add a file in `protocol/` containing the model, defaults, `DecodeUCI`, `Validate`
and a local `init` registration, following an existing protocol file:

```go
func init() {
    register("my-protocol", func() Config { return newMyProtocol() })
}
```

There is no central constructor or decoding switch to edit. Registration rejects
empty names, nil factories and duplicate names; each constructor returns a fresh
node. All registrations run during package initialization, before decoding.
This automates model/decoder discovery only: support for a new protocol's native
Xray or sing-box output still requires the corresponding core builder changes.

References: Go's [package initialization](https://go.dev/ref/spec#Package_initialization)
and [interfaces](https://go.dev/ref/spec#Interface_types).

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

- LuCI edits UCI, rules and custom configurations, then submits a JSON snapshot.
- Go validates the snapshot and generates proxy and template-shunt JSON using
  native core types. Its output is read-only; it does not apply system changes.
- The existing LuCI Save & Apply flow writes returned JSON, resolves chained
  dial addresses through `net.sh` without changing TLS names, updates Geo UCI
  metadata, cleans renamed/deleted node files and applies UCI.
- Existing Shell scripts own service startup, Geo conversion, DNS and firewall
  work. Startup/restart uses saved JSON rather than invoking Go generation.

A render or address-resolution failure prevents Save & Apply from writing JSON
or applying UCI. File writes retain the original LuCI behavior; they are not a
multi-file transaction. Custom configurations are omitted from generated output.
Go does not invoke native core executables for checking; actual startup remains
responsible for reporting core failures. CLI UCI edits alone do not regenerate
JSON: generate it explicitly or use LuCI Save & Apply before restarting.

## Interfaces

The installed binary is `/usr/bin/hijpass-config`; rpcd discovers the same binary
through `/usr/libexec/rpcd/hijpass-config`.

| Entry point | Input | Result / side effects |
| --- | --- | --- |
| `render` | JSON array of UCI sections on stdin | JSON `{nodes, shunt}` on stdout, no writes |
| `list` | none | rpcd method schema |
| `call validate` | `{sections: "JSON array"}` on stdin | `{ok: true}` or `{error: string}` |
| `call render` | `{sections: "JSON array", target: "section-id"}` | `{config: object}` or `{error: string}` |

The RPC render target `shunt` previews template routing. An empty target returns
all generated objects. Section IDs and types use LuCI's `.name` / `.type` keys;
options must be strings or string lists. Inputs are limited to 4 MiB. RPC methods
are read-only and cannot execute `generate` or publish client-supplied paths.
They require the existing Hijpass **write** ACL because previews contain secrets.
RPC validation checks the submitted snapshot's structure, supported fields and
references. `generate` is no longer a supported CLI command.

Geo metadata remains in the existing `geosite_ruleset` / `geoip_ruleset` UCI
options consumed by `geoview.sh`. The old Go-generated metadata manifests are
no longer read or written. Existing generated JSON remains usable.

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
The original dependency migration was also checked with Go race tests and static
ARM64/MIPSLE cross-compilation. Run the commands above to verify current changes.
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
