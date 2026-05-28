# Core Protocol Abstraction Refactor

**Date:** 2026-05-28  
**Scope:** `ts-src/core/` (new), `ts-src/module/xray.ts`, `ts-src/module/singbox.ts`, `ts-src/utils/xray/config.ts`, `ts-src/utils/singbox/config.ts`

## Problem

Adding a new proxy protocol currently requires changes in 6 files across `module/` and `utils/`. The `switch (config.type)` statements in `utils/xray/config.ts` and `utils/singbox/config.ts` act as implicit protocol registries but have no interface contract — TypeScript won't warn if an implementation is incomplete or missing.

Specific pain:
- `module/xray.ts` (522 lines) mixes infrastructure classes (DNS, Route, Inbound) with protocol-specific outbounds (Hysteria2, Vless, Shadowsocks) and transport interfaces
- `module/singbox.ts` (521 lines) same problem
- `utils/xray/config.ts` and `utils/singbox/config.ts` contain protocol-building functions scattered alongside shunt config generation logic

## Goal

New protocol = implement one interface per core + register one line. TypeScript enforces completeness.

## Directory Structure

```
ts-src/
  core/
    xray/
      models.ts            # Infrastructure: Log, DNS, DnsServer, Route, RouteRule, DnsRule,
                           # Inbound, Outbound interface, Freedom, DnsOutbound, BlockOutbound,
                           # Socks, Balancer, BurstObservatory, transport interfaces
      protocols/
        protocol.ts        # XrayProtocol interface + XrayProtocolRegistry + xrayRegistry singleton
        registry.ts        # Imports all protocol files (side-effect registration)
        hysteria2.ts       # Hysteria2Outbound class + XrayProtocol impl
        vless.ts           # VlessOutbound class + all transport/stream logic + XrayProtocol impl
        shadowsocks.ts     # ShadowsocksXrayOutbound class + XrayProtocol impl
      builder.ts           # genShuntConf(), genProxyConf(), buildBaseProxyConf() + helpers

    singbox/
      models.ts            # Infrastructure: Log, DNS, DnsServer, Route, RouteRule, DnsRule,
                           # Inbound implementations, DirectOutbound, BlockOutbound, URLTest,
                           # SocksOutbound, TlsConfig, ObfsConfig, BrutalConfig, MultiplexConfig,
                           # transport interfaces, RuleSet classes
      protocols/
        protocol.ts        # SingBoxProtocol interface + SingBoxProtocolRegistry + singboxRegistry
        registry.ts
        hysteria2.ts       # Hysteria2Outbound class + SingBoxProtocol impl
        vless.ts           # VlessOutbound class + transport + multiplex logic + SingBoxProtocol impl
        shadowsocks.ts     # ShadowsocksOutbound class + multiplex + SingBoxProtocol impl
        tuic.ts            # TuicOutbound class + SingBoxProtocol impl (singbox-only)
        shadowtls.ts       # ShadowTLSOutbound class + SingBoxProtocol impl (singbox-only)
      builder.ts           # genShuntConf(), genProxyConf(), helper functions

  # Unchanged files:
  module/luci.ts           # ProxyNode, *Config types, ShuntSection etc. — only import paths update
  utils/common.ts          # Unchanged
  utils/factory.ts         # Import paths updated to point to core/
  enum/                    # Unchanged
  views/                   # Unchanged (import paths updated)
  types/                   # Unchanged
```

`module/xray.ts` and `module/singbox.ts` are deleted after migration.  
`utils/xray/` and `utils/singbox/` directories are deleted after migration.

## Protocol Interface

```typescript
// core/xray/protocols/protocol.ts
import { ProxyNode } from '../../module/luci'
import { Outbound } from '../models'

export interface XrayProtocol {
    readonly type: string
    build(config: ProxyNode): Outbound
}

export class XrayProtocolRegistry {
    private readonly protocols = new Map<string, XrayProtocol>()

    register(p: XrayProtocol): void {
        this.protocols.set(p.type, p)
    }

    build(type: string, config: ProxyNode): Outbound {
        const p = this.protocols.get(type)
        if (!p) throw new Error(`Unsupported xray protocol: ${type}`)
        return p.build(config)
    }
}

export const xrayRegistry = new XrayProtocolRegistry()
```

`SingBoxProtocol` / `SingBoxProtocolRegistry` are symmetric (return `singbox.Outbound`).

## Protocol File Shape

```typescript
// core/xray/protocols/hysteria2.ts
import { ProxyNode } from '../../../module/luci'
import { Hysteria2Outbound } from '../models'
import { xrayRegistry, XrayProtocol } from './protocol'

const hysteria2: XrayProtocol = {
    type: 'hysteria2',
    build(config: ProxyNode): Hysteria2Outbound {
        // logic migrated from createHysteria2Outbound() in utils/xray/config.ts
    }
}

xrayRegistry.register(hysteria2)
```

## Registry File (explicit, readable)

```typescript
// core/xray/protocols/registry.ts
import './hysteria2'
import './vless'
import './shadowsocks'
// Adding a new protocol: add one import here
```

## Builder

```typescript
// core/xray/builder.ts
import './protocols/registry'              // register all protocols
import { xrayRegistry } from './protocols/protocol'

export const XrayUtils: ShuntConfigUtils = {
    genShuntConf: genConf,
    genProxyConf
}

function genProxyConf(config: ProxyNode): {} {
    const outbound = xrayRegistry.build(config.type, config)
    return buildBaseProxyConf(config, outbound)
}
// genConf() and helpers unchanged, just relocated
```

## How to Add a New Protocol (e.g., Trojan)

1. Add `TrojanConfig` interface to `module/luci.ts`
2. Create `core/xray/protocols/trojan.ts` — implement `XrayProtocol`, add `xrayRegistry.register(...)`
3. Create `core/singbox/protocols/trojan.ts` — implement `SingBoxProtocol`, add `singboxRegistry.register(...)`
4. Add `import './trojan'` to `core/xray/protocols/registry.ts`
5. Add `import './trojan'` to `core/singbox/protocols/registry.ts`

TypeScript will error if `type` or `build` is missing. No switch statement to hunt down.

## tsconfig.json Changes

Add `"core/**/*.ts"` to the `include` array. Remove `"module/**/*.ts"` and `"utils/**/*.ts"` only after migration is complete.

## Files Deleted After Migration

- `ts-src/module/xray.ts`
- `ts-src/module/singbox.ts`
- `ts-src/utils/xray/config.ts`
- `ts-src/utils/singbox/config.ts`
- `ts-src/utils/xray/` (directory)
- `ts-src/utils/singbox/` (directory)

## Out of Scope

- `utils/common.ts` refactor (separate task)
- `views/` decomposition
- `module/luci.ts` rename/split
