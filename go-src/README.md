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

There are three top-level functional modules. The layout follows the
[Go module layout guide](https://go.dev/doc/modules/layout): directories represent
cohesive packages, while files separate details within a responsibility.

```text
main.go                 process entry and exit status
command/                CLI/RPC dispatch, input limits and source selection
  cli.go
  rpc.go
  input.go
uci/                    UCI loading, section access and scalar decoding
  load.go
  section.go
  decoder.go, values.go
  validation.go
generator/              complete configuration generation workflow
  generate.go           whole-config generation, previews and validation
  config.go             ordered input snapshot and section lookup
  validation.go         proxy dependency and port validation
  proxy.go              protocol adaptation and local proxy references
  routing.go            shunt coordination, DNS selection and reference resolution
  rules.go              shared rule interpretation
  output.go             per-core output types and serialization
  protocol/             per-protocol models, conversion, defaults and validation
  singbox/              native sing-box builders, including dns.go and routing.go
  xray/                 native Xray builders, including dns.go and routing.go
  testdata/             immutable compatibility fixtures
```

`command` selects system UCI or a supplied snapshot and calls `generator`.
`uci` imports no application or core models. `generator` owns proxy dependencies,
DNS selection, route interpretation, validation and JSON output. DNS/routing are
configuration-generation details, not independent top-level packages.

`generator/protocol` retains each protocol's interface, fields, conversion and
local registration. `generator/singbox` and `generator/xray` receive typed inputs
with resolved upstream/member object references for proxy generation, and return
their native configuration types. Shunt builders also receive resolved proxy
objects and DNS options; neither builder accepts reference-resolution callbacks.
They do not import the parent generator package or access UCI. The parent
converts native pointers to `XrayConfig` or `SingBoxConfig` and returns them as
`json.Marshaler`. Each type selects its native serializer; no dual-field output
envelope or core-selection check is needed. There is
no separate `core`, `source`, `config`, `proxy`, `dns` or `routing` package.

Proxy generation decodes reachable nodes, connects `ServerOptions.Upstream`
and `LoadBalance.Members` to shared `protocol.Config` objects, validates that
graph, then calls the core's `Build(config)` without a port lookup callback.
The catalog owns UCI reference names; protocol objects retain no duplicate name
list. Graph validation detects cycles along the active path and remembers chain
heights so shared upstreams neither cause false cycles nor hide excessive depth.
Custom configurations expose only their local entry metadata and dependency;
their JSON is still user-managed. A single-node preview resolves only its
reachable dependencies, which must be enabled even if the previewed root is not.
Shunt generation and preview resolve and validate every enabled proxy because
all of them become local SOCKS outbounds, preserving UCI order. Default, rule,
split-rule and DNS exits are checked before generation; core output tags remain
strings. DNS policies retain server objects rather than looking up UCI names
while generating rules. sing-box rule-set download exits and their DNS settings
are prepared from the same resolved objects. Missing/disabled references and
invalid proxy dependency graphs fail in both full generation and shunt previews.


Only `uci.Load` accesses the running system. It executes the fixed `/bin/ubus`
program directly (no shell) to read a UCI package through the
[OpenWrt UCI interface](https://openwrt.org/docs/guide-developer/ubus/uci).
This works without a browser or LuCI session. It requires `ubusd`, `rpcd` and
the `ubus` CLI on OpenWrt; the backend package declares `rpcd` and `ubus`.
The response's `.index` restores section order before routing rules are built;
section IDs, anonymous metadata, strings and lists are retained. Reads have a
10-second timeout and a 4 MiB output limit. Browser-session edits are not loaded
implicitly: previews explicitly submit their snapshot. The system source uses
rpcd's ordinary UCI view, including any non-session staged changes visible to it.

Go does not manage services, resolve network addresses, convert Geo resources or
publish generated files. Those operations stay in the existing LuCI/Shell flow.

Protocol interfaces live in `generator/protocol/protocol.go`. Each concrete protocol keeps
its fields, defaults, `DecodeUCI` implementation and validation in its own file.
`generator/protocol/options.go` contains only shared field conversions. Missing UCI options
preserve defaults and irrelevant protocol fields are ignored.

Tests reside with the responsibility they exercise: output compatibility and
native configuration checks in `generator`, decoding/registration in `generator/protocol` and `generator`, source decoding in `uci`,
and LuCI save/apply plus Shell integration under `ts-src/tests`. The shared compatibility
fixture stays in `generator/testdata/` for both Go and frontend RPC tests. The OpenWrt
build copies all source packages; `go build .` still builds the executable from
the module root.

Ordinary source filenames have no underscores; test files retain `_test.go`.

### Adding a protocol

Add a file in `generator/protocol/` containing the model, defaults, `DecodeUCI`, `Validate`
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

- Go reads system UCI by default. LuCI can submit a snapshot for unsaved previews
  and the existing Save & Apply flow. Both sources share one generation pipeline.
- Go validates the configuration and generates proxy and template-shunt JSON using
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
JSON: use the CLI examples below to obtain the new JSON, or use LuCI Save & Apply
before restarting. CLI output is not automatically installed into runtime files.

## Interfaces

The installed binary is `/usr/bin/hijpass-config`; rpcd discovers the same binary
through `/usr/libexec/rpcd/hijpass-config`.

| Entry point | Input | Result / side effects |
| --- | --- | --- |
| `render` | system UCI `hijpass` | JSON `{nodes, shunt}` on stdout, no writes |
| `render --target ID` | system UCI `hijpass` | one native core JSON object |
| `render --stdin [--target ID]` | JSON section array on stdin | same generator, explicit snapshot |
| `list` | none | rpcd method schema |
| `call validate` | `{}` or `{sections: "JSON array"}` | `{ok: true}` or `{error: string}` |
| `call render` | `{target: "section-id"}` with optional `sections` | `{config: object}` or `{error: string}` |

Omitting `sections` (or sending JSON null) selects system UCI. An explicit string,
even an empty or invalid one, never falls back to system configuration. An empty
render target returns all generated objects. `shunt` selects the template shunt.
Section IDs/types use `.name`/`.type`; option values must be strings or string lists.
Inputs are limited to 4 MiB. Read-only RPC methods keep the existing Hijpass
**write** ACL because their output contains credentials. `generate` remains
unsupported: this executable produces JSON, it does not apply services or files.

```sh
# Independent of LuCI; emit all enabled generated configurations.
hijpass-config render

# Emit one native configuration (replace SECTION_ID with its UCI section ID).
hijpass-config render --target SECTION_ID
hijpass-config render --target shunt

# Explicit editor/test snapshot; no system UCI access.
hijpass-config render --stdin < sections.json

# System-backed RPC, without frontend section data.
ubus call hijpass-config render '{"target":"shunt"}'
```

The default CLI source changed from stdin to system UCI. Existing snapshot scripts
must add `--stdin`. LuCI's existing explicit snapshot requests remain compatible.
Errors produce nonzero CLI status; RPC returns its established error envelope.

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

`generator/testdata/compatibility.json` contains 49 immutable output samples captured from the
former browser generator at commit
`bca34e5285fd8edd7da6cb2fd23e499e68c9f502`. Fixtures use synthetic credentials.
The Xray Shadowsocks UoT sample must first return an explicit error; its remaining
options are then compared with UoT disabled. For all 49 samples, tests apply the
explicitly listed schema migrations, then
use native parsers/serializers to compare both sides. They also exercise Xray's
native `Build`, numeric bounds, Geo rule-set preservation and removed outbound
handling. TLS preservation during address replacement is covered by the LuCI
file-write integration test, where the production replacement runs. Native tests also check
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

Additional tests exercise RPC/CLI boundaries, explicit snapshot selection, UCI
response ordering and output limits, DNS port validation, dependency failures,
LuCI Save & Apply ordering and custom config preservation. The current rewrite
passes `go test`, `go vet`, all 49 compatibility fixtures and the 9 backend/frontend integration
tests. System UCI reads still need on-device ubus integration verification; these
checks do not replace an OpenWrt SDK build or connectivity tests with the installed
proxy cores.

For cross-compilation without an SDK (binary smoke check only):

```sh
cd go-src
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -o /tmp/hijpass-config-arm64 .
CGO_ENABLED=0 GOOS=linux GOARCH=mipsle GOMIPS=softfloat go build -o /tmp/hijpass-config-mipsle .
```

The root package Makefile uses OpenWrt's Go toolchain and emits an architecture
specific `hijpass-config` package alongside the architecture independent LuCI
package. A full package build still requires the OpenWrt source tree or SDK.
