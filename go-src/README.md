# Hijpass configuration generator

This directory replaces the former TypeScript core builders. It uses only the Go
standard library (Go 1.23 or newer). It runs on demand; it is not a daemon.

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

`testdata/compatibility.json` contains 49 output comparisons captured from the
former browser generator at commit
`bca34e5285fd8edd7da6cb2fd23e499e68c9f502`. Fixtures use synthetic credentials.
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
