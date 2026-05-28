# Core Protocol Abstraction Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor xray and singbox core implementations so each proxy protocol is a self-contained file implementing a typed interface, replacing hidden `switch` statements with an explicit registry.

**Architecture:** Two parallel `core/xray/` and `core/singbox/` directories each contain `models.ts` (infrastructure classes), `protocols/protocol.ts` (interface + registry singleton), per-protocol files that register themselves, `protocols/registry.ts` (imports all protocols), and `builder.ts` (genShuntConf/genProxyConf using the registry). Old `module/xray.ts`, `module/singbox.ts`, `utils/xray/`, `utils/singbox/` are deleted once `core/` is in place.

**Tech Stack:** TypeScript 5.6, esbuild 0.25, no test framework — verification is `npx tsc --noEmit` (type check) followed by `node build.mjs` (full bundle).

---

## File Map

**Create:**
- `ts-src/core/xray/models.ts` — Log, DNS, Route, Inbound, Outbound interface, infrastructure outbounds (extracted from `module/xray.ts`)
- `ts-src/core/xray/protocols/protocol.ts` — `XrayProtocol` interface + `XrayProtocolRegistry` + `xrayRegistry` singleton
- `ts-src/core/xray/protocols/hysteria2.ts` — `Hysteria2Outbound` class + xray adapter
- `ts-src/core/xray/protocols/shadowsocks.ts` — `ShadowsocksXrayOutbound` class + xray adapter
- `ts-src/core/xray/protocols/vless.ts` — `VlessOutbound` class + all stream/transport types + xray adapter
- `ts-src/core/xray/protocols/registry.ts` — imports the three protocol files
- `ts-src/core/xray/builder.ts` — `genShuntConf()`, `genProxyConf()`, `buildBaseProxyConf()`, helpers
- `ts-src/core/singbox/models.ts` — Log, DNS, Route, Inbound impls, infrastructure outbounds, `TlsConfig`, `MultiplexConfig` (extracted from `module/singbox.ts`)
- `ts-src/core/singbox/protocols/protocol.ts` — `SingBoxProtocol` interface + `SingBoxProtocolRegistry` + `singboxRegistry` singleton
- `ts-src/core/singbox/protocols/hysteria2.ts` — `Hysteria2Outbound` + `ObfsConfig` + singbox adapter
- `ts-src/core/singbox/protocols/shadowsocks.ts` — `ShadowsocksOutbound` + singbox adapter
- `ts-src/core/singbox/protocols/vless.ts` — `VlessOutbound` + transport types + singbox adapter
- `ts-src/core/singbox/protocols/tuic.ts` — `TuicOutbound` + singbox adapter (singbox-only)
- `ts-src/core/singbox/protocols/shadowtls.ts` — `ShadowTLSOutbound` + singbox adapter (singbox-only)
- `ts-src/core/singbox/protocols/registry.ts` — imports all five protocol files
- `ts-src/core/singbox/builder.ts` — `genConf()`, `genProxyConf()`, helpers

**Modify:**
- `ts-src/tsconfig.json` — add `"core/**/*.ts"` to `include`
- `ts-src/utils/factory.ts` — update imports to point to `core/` instead of `utils/xray/` and `utils/singbox/`

**Delete:**
- `ts-src/module/xray.ts`
- `ts-src/module/singbox.ts`
- `ts-src/utils/xray/config.ts` + `ts-src/utils/xray/` directory
- `ts-src/utils/singbox/config.ts` + `ts-src/utils/singbox/` directory

---

## Task 1: tsconfig + directory scaffold

**Files:**
- Modify: `ts-src/tsconfig.json`

- [ ] **Step 1: Add `core/**/*.ts` to tsconfig include**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "useDefineForClassFields": true
  },
  "include": [
    "views/**/*.ts",
    "types/**/*.d.ts",
    "enum/**/*.ts",
    "module/**/*.ts",
    "utils/**/*.ts",
    "core/**/*.ts"
  ]
}
```

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p ts-src/core/xray/protocols
mkdir -p ts-src/core/singbox/protocols
```

- [ ] **Step 3: Verify type check still passes**

```bash
cd ts-src && npx tsc --noEmit
```
Expected: no errors (no new files yet).

- [ ] **Step 4: Commit**

```bash
git add ts-src/tsconfig.json
git commit -m "chore: add core/ to tsconfig include"
```

---

## Task 2: core/xray/models.ts

Extract infrastructure from `module/xray.ts` — excludes `Hysteria2Outbound`, `ShadowsocksXrayOutbound`, `VlessOutbound`, and their transport interfaces (those move to protocol files).

**Files:**
- Create: `ts-src/core/xray/models.ts`

- [ ] **Step 1: Create `ts-src/core/xray/models.ts`**

```typescript
import { XrayEnum } from '../../enum/xray'

export class Log {
    loglevel: string
    dnsLog: boolean

    constructor(logLevel: string) {
        this.loglevel = logLevel || XrayEnum.DEFAULT_LOG_LEVEL
        this.dnsLog = false
    }
}

export class DnsServer {
    tag: string
    address: string
    port: number
    queryStrategy: string
    domains: string[]
    skipFallback: boolean
    disableCache: boolean

    constructor(type: string, tag: string, address: string, port: number) {
        switch (type) {
            case 'tcp':
                this.address = 'tcp://' + address
                this.port = port
                break
            case 'https':
                this.address = 'https://' + address
                if (port) this.address += ':' + port
                this.address += '/dns-query'
                break
            case 'quic':
                this.address = 'quic://' + address
                this.port = port
                break
            case 'udp':
                this.address = address
                this.port = port
                break
            default:
                throw new Error('Invalid xray DNS server type: ' + type)
        }
        this.tag = tag
        this.domains = []
        this.skipFallback = true
    }
}

export class DNS {
    servers: DnsServer[]
    rules: DnsRule[]
    queryStrategy: string
    disableCache: boolean
    serveStale: boolean
    serveExpiredTTL: number
    disableFallback: boolean
    disableFallbackIfMatch: boolean

    constructor(queryStrategy: string, cache: boolean) {
        this.servers = []
        this.rules = []
        this.queryStrategy = queryStrategy || XrayEnum.DEFAULT_DNS_STRATEGY
        this.disableCache = !cache
        this.serveStale = !cache
        this.serveExpiredTTL = 3600
        this.disableFallback = false
        this.disableFallbackIfMatch = true
    }
}

export class Rule {
    ruleTag: string
    inboundTag: string[]
    outboundTag: string
    balancerTag: string

    constructor(ruleTag: string, inboundTag: string[], outbound: string) {
        this.ruleTag = ruleTag
        this.inboundTag = inboundTag
        if (outbound === XrayEnum.LOAD_BALANCE_OUTBOUND_TAG) {
            this.balancerTag = outbound
        } else {
            this.outboundTag = outbound
        }
    }
}

export class RouteRule extends Rule {
    domain: string[]
    network: string[]
    ip: string[]
    protocol: string[]
    port: string

    constructor(tag: string, outbound: string) {
        super(tag, undefined, outbound)
        this.inboundTag = [XrayEnum.TPROXY_INBOUND_TAG]
        this.domain = []
        this.network = []
        this.ip = []
        this.protocol = []
    }
}

export class DnsRule extends Rule {
    constructor(tag: string[], outbound: string) {
        super(undefined, tag, outbound)
    }
}

export class Route<T extends Rule> {
    rules: T[]
    domainStrategy: string
    balancers: Balancer[]

    constructor() {
        this.rules = []
        this.domainStrategy = 'AsIs'
        this.balancers = []
    }
}

export interface Outbound {
    settings?: any
    protocol: string
    tag: string
    streamSettings?: any
}

export class BlockOutbound implements Outbound {
    settings?: any
    protocol: string
    tag: string
    streamSettings?: any

    constructor(tag: string) {
        this.protocol = 'blackhole'
        this.tag = tag
    }
}

export class Socks implements Outbound {
    settings: any
    protocol: string
    tag: string

    constructor(address: string, port: number, tag: string) {
        this.protocol = 'socks'
        this.tag = tag
        this.settings = { address, port }
    }
}

export class DnsOutbound implements Outbound {
    settings: any
    protocol: string
    tag: string

    constructor(tag: string) {
        this.protocol = 'dns'
        this.tag = tag
        this.settings = { nonIPQuery: 'reject' }
    }
}

export class Freedom implements Outbound {
    settings: any
    protocol: string
    tag: string

    constructor(tag: string) {
        this.protocol = 'freedom'
        this.tag = tag
        this.settings = { domainStrategy: XrayEnum.DEFAULT_DNS_STRATEGY }
    }
}

export interface TlsObject {
    serverName: string
    allowInsecure?: boolean
    alpn?: string[]
}

export interface SockoptObject {
    mark?: number
    tcpMaxSeg?: number
    tcpFastOpen?: boolean | number
    tproxy?: string
    domainStrategy?: string
    dialerProxy?: string
    acceptProxyProtocol?: boolean
    tcpKeepAliveInterval?: number
    tcpKeepAliveIdle?: number
    tcpUserTimeout?: number
    tcpCongestion?: string
    interface?: string
    v6only?: boolean
    tcpWindowClamp?: number
    tcpMptcp?: boolean
}

export class Balancer {
    tag: string
    selector: string[]
    fallbackTag: string
    strategy: {
        type: string
        settings: { expected: number; maxRTT: string; tolerance: number }
    }

    constructor(tag: string) {
        this.tag = tag
        this.selector = []
        this.fallbackTag = undefined
        this.strategy = {
            type: 'leastLoad',
            settings: { expected: 1, maxRTT: '1s', tolerance: 0.05 }
        }
    }
}

export class BurstObservatory {
    subjectSelector: string[]
    pingConfig: {
        destination: string
        connectivity: string
        interval: string
        timeout: string
        sampling: number
        httpMethod: string
    }

    constructor(
        destination: string,
        connectivity: string,
        interval: string,
        timeout: string,
        sampling: number,
        httpMethod: string
    ) {
        this.subjectSelector = []
        this.pingConfig = {
            destination: destination || 'https://connectivitycheck.gstatic.com/generate_204',
            connectivity: connectivity || undefined,
            interval: interval || '60s',
            timeout: timeout || '2s',
            sampling: sampling || 3,
            httpMethod: httpMethod || undefined,
        }
    }
}

export class Inbound {
    protocol: string
    tag: string
    port: number
    settings: any
    streamSettings: any
    sniffing: any

    constructor(type: string, port: number, tag: string) {
        this.protocol = 'dokodemo-door'
        this.tag = tag
        this.port = port
        this.settings = { network: 'tcp,udp', followRedirect: undefined }
        if (type === 'tproxy') {
            this.settings.followRedirect = true
            this.streamSettings = { sockopt: { tproxy: 'tproxy' } }
            this.sniffing = {
                enabled: true,
                destOverride: ['http', 'tls', 'quic'],
                routeOnly: true
            }
        }
    }
}
```

- [ ] **Step 2: Type check**

```bash
cd ts-src && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add ts-src/core/xray/models.ts
git commit -m "feat: add core/xray/models.ts — xray infrastructure classes"
```

---

## Task 3: core/xray protocol interface + three protocol adapters

**Files:**
- Create: `ts-src/core/xray/protocols/protocol.ts`
- Create: `ts-src/core/xray/protocols/hysteria2.ts`
- Create: `ts-src/core/xray/protocols/shadowsocks.ts`
- Create: `ts-src/core/xray/protocols/vless.ts`

- [ ] **Step 1: Create `ts-src/core/xray/protocols/protocol.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import type { Outbound } from '../models'

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

- [ ] **Step 2: Create `ts-src/core/xray/protocols/hysteria2.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import { Hysteria2Config } from '../../../module/luci'
import type { Outbound, TlsObject } from '../models'
import { xrayRegistry, type XrayProtocol } from './protocol'

interface HysteriaSettings {
    version: 2
    auth: string
    udpIdleTimeout?: number
}

interface Hysteria2StreamSettings {
    network: 'hysteria'
    security: 'tls'
    tlsSettings: TlsObject
    hysteriaSettings: HysteriaSettings
}

export class Hysteria2Outbound implements Outbound {
    settings: { version: 2; address: string; port: number }
    protocol: string
    tag: string
    streamSettings: Hysteria2StreamSettings

    constructor(
        address: string,
        port: number,
        tag: string,
        password: string,
        serverName: string,
        allowInsecure: boolean = false,
        udpIdleTimeout?: number
    ) {
        this.protocol = 'hysteria'
        this.tag = tag
        this.settings = { version: 2, address, port }
        this.streamSettings = {
            network: 'hysteria',
            security: 'tls',
            tlsSettings: { serverName, allowInsecure, alpn: ['h3'] },
            hysteriaSettings: {
                version: 2,
                auth: password,
                ...(udpIdleTimeout !== undefined ? { udpIdleTimeout } : {})
            }
        }
    }
}

const hysteria2Protocol: XrayProtocol = {
    type: 'hysteria2',
    build(config: ProxyNode): Outbound {
        const c = config as Hysteria2Config
        const udpIdleTimeout = c.udp_idle_timeout ? Number(c.udp_idle_timeout) : undefined
        return new Hysteria2Outbound(
            c.server,
            Number(c.server_port),
            c.name,
            c.password || '',
            c.tls_server_name || c.server,
            c.tls_insecure === '1',
            udpIdleTimeout
        )
    }
}

xrayRegistry.register(hysteria2Protocol)
```

- [ ] **Step 3: Create `ts-src/core/xray/protocols/shadowsocks.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import { ShadowsocksConfig } from '../../../module/luci'
import type { Outbound } from '../models'
import { xrayRegistry, type XrayProtocol } from './protocol'

export class ShadowsocksXrayOutbound implements Outbound {
    settings: {
        address: string
        port: number
        method: string
        password: string
        uot?: boolean
        level: number
    }
    protocol: string
    tag: string

    constructor(
        address: string,
        port: number,
        tag: string,
        method: string,
        password: string,
        uot?: boolean
    ) {
        this.protocol = 'shadowsocks'
        this.tag = tag
        this.settings = { address, port, method, password, uot: uot || undefined, level: 0 }
    }
}

const shadowsocksProtocol: XrayProtocol = {
    type: 'shadowsocks',
    build(config: ProxyNode): Outbound {
        const c = config as ShadowsocksConfig
        return new ShadowsocksXrayOutbound(
            c.server,
            Number(c.server_port),
            c.name,
            c.method,
            c.password,
            c.udp_over_tcp === '1' ? true : undefined
        )
    }
}

xrayRegistry.register(shadowsocksProtocol)
```

- [ ] **Step 4: Create `ts-src/core/xray/protocols/vless.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import { VlessConfig } from '../../../module/luci'
import type { Outbound, TlsObject } from '../models'
import { xrayRegistry, type XrayProtocol } from './protocol'

interface WsObject {
    path?: string
    headers?: Record<string, string>
    heartbeatPeriod?: number
}

interface GrpcObject {
    serviceName?: string
    multiMode?: boolean
    authority?: string
    user_agent?: string
    idle_timeout?: number
    health_check_timeout?: number
    permit_without_stream?: boolean
    initial_windows_size?: number
}

interface HttpObject {
    host?: string[]
    path?: string
    method?: string
}

interface HttpUpgradeObject {
    host?: string
    path?: string
    headers?: Record<string, string>
}

interface XHTTPObject {
    host?: string
    path?: string
    mode?: string
}

interface RealityObject {
    show?: boolean
    target?: string
    xver?: number
    serverNames?: string[]
    privateKey?: string
    minClientVer?: string
    maxClientVer?: string
    maxTimeDiff?: number
    shortIds?: string[]
    mldsa65Seed?: string
    fingerprint?: string
    serverName?: string
    password?: string
    shortId?: string
    mldsa65Verify?: string
    spiderX?: string
}

interface VlessStreamSettings {
    network?: string
    security: string
    xhttpSettings?: XHTTPObject
    wsSettings?: WsObject
    grpcSettings?: GrpcObject
    httpSettings?: HttpObject
    httpupgradeSettings?: HttpUpgradeObject
    realitySettings?: RealityObject
    tlsSettings?: TlsObject
}

export class VlessOutbound implements Outbound {
    settings: any
    protocol: string
    tag: string
    streamSettings?: any

    constructor(
        address: string,
        port: number,
        id: string,
        tag: string,
        encryption: string = 'none',
        flow?: string,
        level: number = 0
    ) {
        this.protocol = 'vless'
        this.tag = tag
        this.settings = { address, port, id, encryption, level }
        if (flow) this.settings.flow = flow
    }
}

const vlessProtocol: XrayProtocol = {
    type: 'vless',
    build(config: ProxyNode): Outbound {
        const c = config as VlessConfig

        const outbound = new VlessOutbound(
            c.server,
            Number(c.server_port),
            c.uuid,
            c.name,
            'none',
            c.flow || undefined,
            0
        )

        const useReality = c.tls_reality_enabled === '1'
        const realitySettings: RealityObject = useReality ? {
            fingerprint: 'chrome',
            serverName: c.tls_server_name || c.server,
            password: c.tls_reality_public_key || '',
            shortId: c.tls_reality_short_id || ''
        } : null

        const tlsSettings: TlsObject = !useReality ? {
            allowInsecure: c.tls_insecure === '1',
            alpn: ['h2', 'http/1.1'],
            serverName: c.tls_server_name || c.server,
        } : null

        const security = useReality
            ? 'reality'
            : (c.tls_server_name || c.tls_insecure ? 'tls' : 'none')

        const streamSettings: VlessStreamSettings = { network: 'raw', security }
        if (realitySettings) streamSettings.realitySettings = realitySettings
        if (tlsSettings && security === 'tls') streamSettings.tlsSettings = tlsSettings

        switch (c.transport_type || '') {
            case 'xhttp':
                streamSettings.network = 'xhttp'
                streamSettings.xhttpSettings = {
                    host: c.transport_xhttp_host || undefined,
                    path: c.transport_xhttp_path || '/',
                    mode: c.transport_xhttp_mode || 'auto'
                }
                break
            case 'ws':
                streamSettings.network = 'websocket'
                streamSettings.wsSettings = {
                    path: c.transport_ws_path || '/',
                    ...(c.transport_ws_max_early_data ? {
                        headers: { 'Sec-WebSocket-Protocol': c.transport_ws_early_data_header_name || '' }
                    } : {})
                }
                break
            case 'grpc':
                streamSettings.network = 'grpc'
                streamSettings.grpcSettings = {
                    serviceName: c.transport_grpc_service_name || 'TunService',
                    ...(c.transport_grpc_idle_timeout ? { idle_timeout: Number(c.transport_grpc_idle_timeout) } : {}),
                    ...(c.transport_grpc_permit_without_stream === '1' ? { permit_without_stream: true } : {})
                }
                break
            case 'http':
                streamSettings.network = 'h2'
                streamSettings.httpSettings = {
                    ...(c.transport_http_host ? { host: [c.transport_http_host] } : {}),
                    path: c.transport_http_path || '/',
                    ...(c.transport_http_method ? { method: c.transport_http_method } : {})
                }
                break
            case 'httpupgrade':
                streamSettings.network = 'httpupgrade'
                streamSettings.httpupgradeSettings = {
                    host: c.transport_httpupgrade_host || undefined,
                    path: c.transport_httpupgrade_path || '/'
                }
                break
        }

        outbound['streamSettings'] = streamSettings
        return outbound
    }
}

xrayRegistry.register(vlessProtocol)
```

- [ ] **Step 5: Type check**

```bash
cd ts-src && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add ts-src/core/xray/protocols/
git commit -m "feat: add core/xray protocol interface and adapters (hysteria2, shadowsocks, vless)"
```

---

## Task 4: core/xray/protocols/registry.ts + core/xray/builder.ts

**Files:**
- Create: `ts-src/core/xray/protocols/registry.ts`
- Create: `ts-src/core/xray/builder.ts`

- [ ] **Step 1: Create `ts-src/core/xray/protocols/registry.ts`**

```typescript
// Register all supported xray protocols.
// Adding a new protocol: create its file, then add one import here.
import './hysteria2'
import './shadowsocks'
import './vless'
```

- [ ] **Step 2: Create `ts-src/core/xray/builder.ts`**

```typescript
import './protocols/registry'
import uci from 'uci'
import { XrayEnum } from '../../enum/xray'
import { ShuntUtils } from '../../utils/common'
import {
    Balancer, BurstObservatory,
    DNS, DnsOutbound, DnsRule, DnsServer,
    Freedom, Inbound, Outbound, Route,
    RouteRule, Socks, BlockOutbound
} from './models'
import { LuciFlied, ShuntTag } from '../../enum/hijpass'
import { ShuntConfigUtils, ProxyNode } from '../../module/luci'
import { xrayRegistry } from './protocols/protocol'

export const XrayUtils: ShuntConfigUtils = {
    genShuntConf: genConf,
    genProxyConf
}

function genConf() {
    const shuntSection = ShuntUtils.getShuntSection()

    const dnsServerMap = new Map<string, DnsServer>()
    const route = new Route()

    const dnsConf = shuntSection.dns
    const dns = new DNS(transDnsStrategy(dnsConf.defaultStrategy), dnsConf.useCache === '1')
    dnsConf.nodes.forEach(function (dnsNode) {
        const server = new DnsServer(dnsNode.type, dnsNode.tag, dnsNode.server, Number(dnsNode.port))
        dnsServerMap.set(dnsNode.tag, server)
    })

    const routeConf = shuntSection.route
    const outbounds: Outbound[] = []
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section) {
        if (section.enabled === '1') {
            const proxyNode = new Socks('127.0.0.1', Number(section.socks_port), transOutTag(section.name))
            if (section.name === routeConf.defaultProxyNode) {
                outbounds.unshift(proxyNode)
            } else {
                outbounds.push(proxyNode)
            }
        }
    })
    if (routeConf.defaultProxyNode === ShuntTag.DIRECT_OUTBOUND_TAG) {
        outbounds.unshift(new Freedom(XrayEnum.DIRECT_OUTBOUND_TAG))
    } else {
        outbounds.push(new Freedom(XrayEnum.DIRECT_OUTBOUND_TAG))
    }
    outbounds.push(new BlockOutbound(XrayEnum.BLOCK_OUTBOUND_TAG))
    outbounds.push(new DnsOutbound(XrayEnum.DNS_OUTBOUND_TAG))

    const inbounds = [
        new Inbound('tproxy', parseInt(shuntSection.shuntListenPort, 10), XrayEnum.TPROXY_INBOUND_TAG),
        new Inbound('direct', parseInt(shuntSection.dnsListenPort, 10), XrayEnum.DNS_INBOUND_TAG)
    ]

    const dnsRules = [new DnsRule([XrayEnum.DNS_INBOUND_TAG], XrayEnum.DNS_OUTBOUND_TAG)]
    const routeRules = []
    const defaultDnsTmpl = dnsServerMap.get(dnsConf.defaultDnsNode)
    const dnsInOutMap = new Map<string, string[]>()

    routeConf.rules.forEach(function (rule) {
        if (rule.enabled !== '1') return

        const ruleOutBoundTag = transOutTag(rule.proxyNode) || outbounds[0].tag
        const routeRule = new RouteRule(rule.name, ruleOutBoundTag)

        const luciRuleDTO = ShuntUtils.parseRuleList(rule)
        if (luciRuleDTO.isEmpty('geo')) throw new Error('Empty rule: ' + rule.name)

        routeRule.network = luciRuleDTO.network
        routeRule.protocol = transRouteProtocol(luciRuleDTO.protocol)
        let allPorts: string[] = luciRuleDTO.port.map(p => String(p))
        if (luciRuleDTO.portRange && luciRuleDTO.portRange.length > 0) {
            allPorts = allPorts.concat(luciRuleDTO.portRange)
        }
        routeRule.port = allPorts.join(',')

        const domainArrays = [
            addPrefixToElements(luciRuleDTO.domain, 'full:'),
            addPrefixToElements(luciRuleDTO.domainSuffix, 'domain:'),
            luciRuleDTO.domainKeyword,
            addPrefixToElements(luciRuleDTO.domainRegex, 'regexp:'),
            luciRuleDTO.geoSite
        ]
        const ipArrays = [luciRuleDTO.ipCidr, luciRuleDTO.geoIp]
        routeRule.domain = ([] as string[]).concat(...domainArrays.filter(a => Array.isArray(a) && a.length > 0))
        routeRule.domain = routeRule.domain.length > 0 ? routeRule.domain : undefined
        routeRule.ip = ([] as string[]).concat(...ipArrays.filter(a => Array.isArray(a) && a.length > 0))
        routeRule.ip = routeRule.ip.length > 0 ? routeRule.ip : undefined

        if (routeRule.domain) {
            const domainRule = structuredClone(routeRule)
            domainRule.ip = undefined
            routeRules.push(domainRule)
        }
        if (routeRule.ip) {
            const ipRule = structuredClone(routeRule)
            ipRule.domain = undefined
            routeRules.push(ipRule)
        }
        if (!routeRule.domain && !routeRule.ip) routeRules.push(routeRule)

        if (routeRule.outboundTag === XrayEnum.BLOCK_OUTBOUND_TAG) return

        if (luciRuleDTO.containDomain() || luciRuleDTO.containGeo()) {
            const outboundTag = transOutTag(rule.dnsProxyNode) || ruleOutBoundTag
            const dnsTag = transDnsTag(rule.name)
            if (dnsInOutMap.has(outboundTag)) {
                dnsInOutMap.get(outboundTag).push(dnsTag)
            } else {
                dnsInOutMap.set(outboundTag, [dnsTag])
            }
            const dnsTmpl = rule.dnsNode ? dnsServerMap.get(rule.dnsNode) : defaultDnsTmpl
            const server = structuredClone(dnsTmpl)
            server.tag = dnsTag
            server.queryStrategy = transDnsStrategy(rule.dnsStrategy)
            server.domains = routeRule.domain
            dns.servers.push(server)
        }
    })

    const defaultDnsServer = structuredClone(defaultDnsTmpl)
    defaultDnsServer.tag = transDnsTag('default')
    defaultDnsServer.skipFallback = false
    dns.servers.push(defaultDnsServer)

    dnsInOutMap.forEach((v, k) => dns.rules.push(new DnsRule(v, k)))

    route.rules = route.rules.concat(dnsRules)
    route.rules = route.rules.concat(routeRules)

    let burstObservatory = undefined
    if (shuntSection.loadBalance.lbNodeList.length > 0) {
        const lbConf = shuntSection.loadBalance
        const balancer = new Balancer(XrayEnum.LOAD_BALANCE_OUTBOUND_TAG)
        balancer.selector = lbConf.lbNodeList
        balancer.fallbackTag = lbConf.fallbackTag || lbConf.lbNodeList[0]
        const strategy = lbConf.strategy || 'leastLoad'
        balancer.strategy.type = strategy
        if (strategy === 'leastLoad') {
            if (lbConf.strategyExpected) balancer.strategy.settings.expected = parseInt(lbConf.strategyExpected, 10)
            if (lbConf.strategyMaxRtt) balancer.strategy.settings.maxRTT = lbConf.strategyMaxRtt
            if (lbConf.strategyTolerance) balancer.strategy.settings.tolerance = parseFloat(lbConf.strategyTolerance)
        }
        route.balancers.push(balancer)
        burstObservatory = new BurstObservatory(
            lbConf.probeUrl || undefined,
            lbConf.probeConnectivity || undefined,
            lbConf.probeInterval || undefined,
            lbConf.probeTimeout || undefined,
            lbConf.probeSampling ? parseInt(lbConf.probeSampling, 10) : undefined,
            lbConf.probeHttpMethod || undefined
        )
        burstObservatory.subjectSelector = lbConf.lbNodeList
    }

    const log = new (require('./models').Log)(shuntSection.logLevel)

    return {
        log,
        inbounds,
        outbounds,
        dns,
        routing: route,
        burstObservatory
    }
}

function genProxyConf(config: ProxyNode): {} {
    const outbound = xrayRegistry.build(config.type, config)
    return buildBaseProxyConf(config, outbound)
}

function buildBaseProxyConf(config: ProxyNode, outbound: Outbound): {} {
    const tproxyInbound = new Inbound('tproxy', Number(config.listen_port), 'tproxy-in')
    tproxyInbound.sniffing = undefined

    const socksInbound = new Inbound('direct', Number(config.socks_port), 'socks-in')
    socksInbound.settings = { udp: true }
    socksInbound.protocol = 'socks'

    return {
        log: { loglevel: 'info', dnsLog: false },
        inbounds: [tproxyInbound, socksInbound],
        outbounds: [outbound]
    }
}

function transDnsTag(name: string) { return name + '-dns' }

function transOutTag(tag: string) {
    if (tag === ShuntTag.BLOCK_OUTBOUND_TAG) return XrayEnum.BLOCK_OUTBOUND_TAG
    if (tag === ShuntTag.DIRECT_OUTBOUND_TAG) return XrayEnum.DIRECT_OUTBOUND_TAG
    if (tag === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG) return XrayEnum.LOAD_BALANCE_OUTBOUND_TAG
    return tag
}

function transDnsStrategy(strategy: string) {
    switch (strategy) {
        case '4': return 'UseIPv4'
        case '6': return 'UseIPv6'
        case '64': case '46': return 'UseIP'
        default: return undefined
    }
}

function transRouteProtocol(protocol: string[]) {
    if (!protocol) return undefined
    const res = protocol.map((pro: string) => {
        switch (pro) {
            case 'http': case 'tls': case 'quic': case 'bittorrent': return pro
            default: throw new Error('Unsupported xray rule protocol: ' + pro)
        }
    }).filter(p => p !== undefined)
    return res.length === 0 ? undefined : res
}

function addPrefixToElements(arr: string[], prefix: string) {
    if (!Array.isArray(arr)) return []
    return arr.map(item => prefix + item)
}
```

> **Note on the `Log` import in `genConf`:** The `Log` import is already at the top of the file — use `import { ..., Log } from './models'` and replace the `require` call with `new Log(shuntSection.logLevel)` directly. The plan above uses a `require` as a placeholder reminder — the actual import must be at the top level:

Corrected top-of-file imports for `builder.ts`:
```typescript
import {
    Balancer, BurstObservatory, DNS, DnsOutbound, DnsRule, DnsServer,
    Freedom, Inbound, Log, Outbound, Route, RouteRule, Socks, BlockOutbound
} from './models'
```
And in `genConf()` replace the `require` line with: `const log = new Log(shuntSection.logLevel)`

- [ ] **Step 3: Type check**

```bash
cd ts-src && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add ts-src/core/xray/protocols/registry.ts ts-src/core/xray/builder.ts
git commit -m "feat: add core/xray registry and builder — xray core complete"
```

---

## Task 5: core/singbox/models.ts

Extract infrastructure from `module/singbox.ts` — excludes `Hysteria2Outbound`, `ObfsConfig`, `ShadowsocksOutbound`, `TuicOutbound`, `ShadowTLSOutbound`, `VlessOutbound`, and transport interfaces.

**Files:**
- Create: `ts-src/core/singbox/models.ts`

- [ ] **Step 1: Create `ts-src/core/singbox/models.ts`**

```typescript
import { SingBoxEnum } from '../../enum/singbox'
import { RuleDTO } from '../../module/luci'

export class Log {
    disabled: boolean
    level: string
    timestamp: boolean

    constructor(logLevel: string) {
        this.disabled = false
        this.level = logLevel || SingBoxEnum.DEFAULT_LOG_LEVEL
        this.timestamp = true
    }
}

export class DnsServer {
    type: string
    tag: string
    server: string
    port: number
    detour: string

    constructor(type: string, tag: string, server: string, port: number, detour: string) {
        this.type = type
        this.tag = tag
        this.server = server
        this.port = port
        this.detour = detour === SingBoxEnum.DIRECT_OUTBOUND_TAG ? undefined : detour
    }
}

export class DNS {
    servers: DnsServer[]
    rules: DnsRule[]
    strategy: string
    disable_cache: boolean
    disable_expire: boolean
    final: string

    constructor(defaultTag: string, defaultStrategy: string, cache: boolean) {
        this.servers = []
        this.rules = []
        this.strategy = defaultStrategy || SingBoxEnum.DEFAULT_DNS_STRATEGY
        this.disable_cache = !cache
        this.disable_expire = !cache
        this.final = defaultTag
    }
}

export class Rule {
    action: string
    outbound: string

    constructor(action: string, outbound: string) {
        this.action = action
        this.outbound = outbound
    }
}

export class RouteRule extends Rule {
    protocol: string[]
    port: number[]
    port_range: string[]
    domain: string[]
    domain_suffix: string[]
    domain_keyword: string[]
    domain_regex: string[]
    rule_set: string[]
    ip_cidr: string[]
    network: string[]

    constructor(action: string, outbound: string) {
        super(action, outbound)
    }

    initRule(rule: RuleDTO): RouteRule {
        this.network = rule.network
        this.protocol = rule.protocol
        this.port = rule.port
        this.port_range = rule.portRange.map(range => range.replace('-', ':'))
        this.domain = rule.domain
        this.domain_suffix = rule.domainSuffix
        this.domain_keyword = rule.domainKeyword
        this.domain_regex = rule.domainRegex
        this.rule_set = rule.ruleSet.map(r => r.tag)
        this.ip_cidr = rule.ipCidr
        return this
    }
}

export class DnsRule extends Rule {
    domain: string[]
    domain_keyword: string[]
    domain_regex: string[]
    domain_suffix: string[]
    rule_set: string[]
    server: string
    strategy: string
    disable_cache: boolean
    disable_expire: boolean

    constructor(action: string, server: string, strategy: string) {
        super(action, undefined)
        this.action = action
        this.server = server
        this.strategy = strategy
        this.disable_cache = true
    }

    initRule(rule: RuleDTO): DnsRule {
        this.domain = rule.domain
        this.domain_suffix = rule.domainSuffix
        this.domain_keyword = rule.domainKeyword
        this.domain_regex = rule.domainRegex
        this.rule_set = rule.ruleSet.map(r => r.tag)
        return this
    }
}

export class SniffRule extends RouteRule {
    constructor() { super('sniff', undefined) }
}

export class HijackDnsRule extends RouteRule {
    constructor() {
        super('hijack-dns', undefined)
        this.protocol = ['dns']
    }
}

export class RuleSet {
    type: string
    tag: string
    format: string

    constructor(tag: string, type: string, format: string) {
        this.type = type
        this.tag = tag
        this.format = format
    }
}

export class RemoteRuleSet extends RuleSet {
    url: string
    download_detour: string
    update_interval: number

    constructor(tag: string, format: string, url: string, download_detour: string, update_interval: number) {
        super(tag, 'remote', format)
        this.url = url
        this.download_detour = download_detour
        this.update_interval = update_interval
    }
}

export class LocalRuleSet extends RuleSet {
    path: string

    constructor(tag: string, format: string, path: string) {
        super(tag, 'local', format)
        this.path = path
    }
}

export class Route {
    rules: RouteRule[]
    rule_set: RuleSet[]
    default_domain_resolver: string
    final: string

    constructor(defaultProxyTag: string, resolver: string) {
        this.rules = [new SniffRule(), new HijackDnsRule()]
        this.rule_set = []
        this.default_domain_resolver = resolver
        this.final = defaultProxyTag
    }
}

export interface Inbound {
    type: 'tproxy' | 'direct' | 'socks'
    tag: string
    listen: string
    listen_port: number
}

export interface Listener {
    listen: string
    listen_port: number
}

export class TproxyInbound implements Inbound, Listener {
    type: 'tproxy' = 'tproxy'
    tag: string
    listen: string
    listen_port: number

    constructor(port: number, tag: string, address?: string) {
        this.tag = tag
        this.listen = address ?? '::'
        this.listen_port = port
    }
}

export class DnsInbound implements Inbound, Listener {
    type: 'direct' = 'direct'
    tag: string
    listen: string
    listen_port: number

    constructor(port: number, tag: string) {
        this.tag = tag
        this.listen = '::'
        this.listen_port = port
    }
}

export class SocksInbound implements Inbound, Listener {
    type: 'socks' = 'socks'
    tag: string
    listen: string
    listen_port: number
    users?: [{ username: string; password: string }]

    constructor(port: number, tag: string, address?: string) {
        this.tag = tag
        this.listen = address ?? '::'
        this.listen_port = port
    }
}

export interface Outbound {
    type: string
    tag: string
}

export interface Server {
    server: string
    server_port: number
}

export class BlockOutbound implements Outbound {
    type = 'block'
    tag: string
    constructor(tag: string) { this.tag = tag }
}

export class DirectOutbound implements Outbound {
    type = 'direct'
    tag: string
    domain_resolver: string
    constructor(tag: string) { this.tag = tag }
}

export class URLTest implements Outbound {
    type = 'urltest'
    tag: string
    url: string
    interval: string
    tolerance: number
    idle_timeout: string
    interrupt_exist_connections: boolean
    outbounds: string[]

    constructor(
        tag: string,
        url: string,
        interval: string,
        tolerance: number,
        idle_timeout: string,
        interrupt_exist_connections: boolean
    ) {
        this.tag = tag
        this.outbounds = []
        this.url = url
        this.interval = interval
        this.tolerance = tolerance
        this.idle_timeout = idle_timeout
        this.interrupt_exist_connections = interrupt_exist_connections
    }
}

export class SocksOutbound implements Server, Outbound {
    type = 'socks'
    tag: string
    server: string
    server_port: number
    version: '4' | '5' = '5'
    domain_resolver: string

    constructor(server: string, server_port: number, tag: string) {
        this.tag = tag
        this.server = server
        this.server_port = server_port
        this.version = '5'
    }
}

export class TlsConfig {
    enabled: boolean
    server_name: string
    insecure?: boolean
    reality?: { enabled: boolean; public_key: string; short_id: string }

    constructor(serverName: string) {
        this.enabled = true
        this.server_name = serverName
    }
}

export class BrutalConfig {
    enabled: boolean
    up_mbps?: number
    down_mbps?: number

    constructor() { this.enabled = true }
}

export class MultiplexConfig {
    enabled: boolean
    protocol?: 'smux' | 'yamux' | 'h2mux'
    max_connections?: number
    min_streams?: number
    max_streams?: number
    brutal?: BrutalConfig

    constructor() { this.enabled = true }
}
```

- [ ] **Step 2: Type check**

```bash
cd ts-src && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add ts-src/core/singbox/models.ts
git commit -m "feat: add core/singbox/models.ts — singbox infrastructure classes"
```

---

## Task 6: core/singbox protocol interface + five protocol adapters

**Files:**
- Create: `ts-src/core/singbox/protocols/protocol.ts`
- Create: `ts-src/core/singbox/protocols/hysteria2.ts`
- Create: `ts-src/core/singbox/protocols/shadowsocks.ts`
- Create: `ts-src/core/singbox/protocols/vless.ts`
- Create: `ts-src/core/singbox/protocols/tuic.ts`
- Create: `ts-src/core/singbox/protocols/shadowtls.ts`

- [ ] **Step 1: Create `ts-src/core/singbox/protocols/protocol.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import type { Outbound } from '../models'

export interface SingBoxProtocol {
    readonly type: string
    build(config: ProxyNode): Outbound
}

export class SingBoxProtocolRegistry {
    private readonly protocols = new Map<string, SingBoxProtocol>()

    register(p: SingBoxProtocol): void {
        this.protocols.set(p.type, p)
    }

    build(type: string, config: ProxyNode): Outbound {
        const p = this.protocols.get(type)
        if (!p) throw new Error(`Unsupported singbox protocol: ${type}`)
        return p.build(config)
    }
}

export const singboxRegistry = new SingBoxProtocolRegistry()
```

- [ ] **Step 2: Create `ts-src/core/singbox/protocols/hysteria2.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import { Hysteria2Config } from '../../../module/luci'
import { TlsConfig, type Outbound } from '../models'
import { singboxRegistry, type SingBoxProtocol } from './protocol'

export class ObfsConfig {
    type: 'salamander'
    password?: string

    constructor(password: string) {
        this.type = 'salamander'
        this.password = password
    }
}

export class Hysteria2Outbound implements Outbound {
    type = 'hysteria2'
    tag: string
    server: string
    server_port: number
    password?: string
    obfs?: ObfsConfig
    up_mbps?: number
    down_mbps?: number
    server_ports?: string[]
    hop_interval?: string
    network?: string
    tls: TlsConfig

    constructor(tag: string, server: string, server_port: number, serverName: string) {
        this.tag = tag
        this.server = server
        this.server_port = server_port
        this.tls = new TlsConfig(serverName)
    }
}

const hysteria2Protocol: SingBoxProtocol = {
    type: 'hysteria2',
    build(config: ProxyNode): Outbound {
        const c = config as Hysteria2Config
        const outbound = new Hysteria2Outbound(
            c.name,
            c.server,
            parseInt(c.server_port),
            c.tls_server_name || c.server
        )
        if (c.password) outbound.password = c.password
        if (c.up_mbps) outbound.up_mbps = Number(c.up_mbps)
        if (c.down_mbps) outbound.down_mbps = Number(c.down_mbps)
        if (c.server_ports && c.server_ports.length > 0) {
            outbound.server_ports = c.server_ports
                .map(range => range.replace('-', ':'))
                .filter(range => range.length > 0)
        }
        if (c.hop_interval) outbound.hop_interval = c.hop_interval
        if (c.network) outbound.network = c.network
        if (c.obfs_type === 'salamander' && c.obfs_password) {
            outbound.obfs = new ObfsConfig(c.obfs_password)
        }
        outbound.tls.insecure = c.tls_insecure === '1'
        return outbound
    }
}

singboxRegistry.register(hysteria2Protocol)
```

- [ ] **Step 3: Create `ts-src/core/singbox/protocols/shadowsocks.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import { ShadowsocksConfig } from '../../../module/luci'
import { MultiplexConfig, BrutalConfig, type Outbound, type Server } from '../models'
import { singboxRegistry, type SingBoxProtocol } from './protocol'

export class ShadowsocksOutbound implements Server, Outbound {
    type = 'shadowsocks'
    tag: string
    server: string
    server_port: number
    method: string
    password: string
    network?: 'tcp' | 'udp'
    udp_over_tcp?: boolean
    plugin?: string
    plugin_opts?: string
    multiplex?: MultiplexConfig

    constructor(tag: string, server: string, server_port: number, method: string, password: string) {
        this.tag = tag
        this.server = server
        this.server_port = server_port
        this.method = method
        this.password = password
    }
}

function buildMultiplex(config: ShadowsocksConfig): MultiplexConfig {
    const m = new MultiplexConfig()
    if (config.multiplex_protocol) m.protocol = config.multiplex_protocol as 'smux' | 'yamux' | 'h2mux'
    if (config.multiplex_max_connections) m.max_connections = parseInt(config.multiplex_max_connections)
    if (config.multiplex_min_streams) m.min_streams = parseInt(config.multiplex_min_streams)
    if (config.multiplex_max_streams) m.max_streams = parseInt(config.multiplex_max_streams)
    if (config.multiplex_brutal_enabled === '1') {
        const brutal = new BrutalConfig()
        if (config.multiplex_brutal_up_mbps) brutal.up_mbps = parseInt(config.multiplex_brutal_up_mbps)
        if (config.multiplex_brutal_down_mbps) brutal.down_mbps = parseInt(config.multiplex_brutal_down_mbps)
        m.brutal = brutal
    }
    return m
}

const shadowsocksProtocol: SingBoxProtocol = {
    type: 'shadowsocks',
    build(config: ProxyNode): Outbound {
        const c = config as ShadowsocksConfig
        const outbound = new ShadowsocksOutbound(
            c.name, c.server, parseInt(c.server_port), c.method, c.password
        )
        if (c.network) outbound.network = c.network as 'tcp' | 'udp'
        if (c.udp_over_tcp === '1') outbound.udp_over_tcp = true
        if (c.plugin) outbound.plugin = c.plugin
        if (c.plugin_opts) outbound.plugin_opts = c.plugin_opts
        if (c.multiplex_enabled === '1') outbound.multiplex = buildMultiplex(c)
        return outbound
    }
}

singboxRegistry.register(shadowsocksProtocol)
```

- [ ] **Step 4: Create `ts-src/core/singbox/protocols/vless.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import { VlessConfig } from '../../../module/luci'
import { TlsConfig, MultiplexConfig, BrutalConfig, type Outbound, type Server } from '../models'
import { singboxRegistry, type SingBoxProtocol } from './protocol'

export interface HttpTransport {
    type: 'http'
    host?: string
    path?: string
    method?: string
    idle_timeout?: string
    ping_timeout?: string
}

export interface WebSocketTransport {
    type: 'websocket'
    path?: string
    max_early_data?: number
    early_data_header_name?: string
}

export interface GrpcTransport {
    type: 'grpc'
    service_name?: string
    idle_timeout?: string
    ping_timeout?: string
    permit_without_stream?: boolean
}

export interface HttpUpgradeTransport {
    type: 'httpupgrade'
    host?: string
    path?: string
}

export type TransportConfig =
    | HttpTransport
    | WebSocketTransport
    | GrpcTransport
    | HttpUpgradeTransport
    | { type: string; [key: string]: any }

export class VlessOutbound implements Server, Outbound {
    type = 'vless'
    tag: string
    server: string
    server_port: number
    uuid: string
    flow?: 'xtls-rprx-vision'
    network?: 'tcp' | 'udp'
    packet_encoding?: 'packetaddr' | 'xudp'
    tls: TlsConfig
    transport?: TransportConfig
    multiplex?: MultiplexConfig

    constructor(tag: string, server: string, server_port: number, uuid: string, serverName: string) {
        this.tag = tag
        this.server = server
        this.server_port = server_port
        this.uuid = uuid
        this.tls = new TlsConfig(serverName)
    }
}

function buildTransport(c: VlessConfig): TransportConfig | undefined {
    switch (c.transport_type) {
        case 'http': {
            const t: HttpTransport = { type: 'http' }
            if (c.transport_http_host) t.host = c.transport_http_host
            if (c.transport_http_path) t.path = c.transport_http_path
            if (c.transport_http_method) t.method = c.transport_http_method
            if (c.transport_http_idle_timeout) t.idle_timeout = c.transport_http_idle_timeout
            if (c.transport_http_ping_timeout) t.ping_timeout = c.transport_http_ping_timeout
            return t
        }
        case 'ws': {
            const t: WebSocketTransport = { type: 'websocket' }
            if (c.transport_ws_path) t.path = c.transport_ws_path
            if (c.transport_ws_max_early_data) t.max_early_data = parseInt(c.transport_ws_max_early_data)
            if (c.transport_ws_early_data_header_name) t.early_data_header_name = c.transport_ws_early_data_header_name
            return t
        }
        case 'grpc': {
            const t: GrpcTransport = { type: 'grpc' }
            if (c.transport_grpc_service_name) t.service_name = c.transport_grpc_service_name
            if (c.transport_grpc_idle_timeout) t.idle_timeout = c.transport_grpc_idle_timeout
            if (c.transport_grpc_ping_timeout) t.ping_timeout = c.transport_grpc_ping_timeout
            if (c.transport_grpc_permit_without_stream === '1') t.permit_without_stream = true
            return t
        }
        case 'httpupgrade': {
            const t: HttpUpgradeTransport = { type: 'httpupgrade' }
            if (c.transport_httpupgrade_host) t.host = c.transport_httpupgrade_host
            if (c.transport_httpupgrade_path) t.path = c.transport_httpupgrade_path
            return t
        }
        default: return undefined
    }
}

function buildMultiplex(c: VlessConfig): MultiplexConfig {
    const m = new MultiplexConfig()
    if (c.multiplex_protocol) m.protocol = c.multiplex_protocol as 'smux' | 'yamux' | 'h2mux'
    if (c.multiplex_max_connections) m.max_connections = parseInt(c.multiplex_max_connections)
    if (c.multiplex_min_streams) m.min_streams = parseInt(c.multiplex_min_streams)
    if (c.multiplex_max_streams) m.max_streams = parseInt(c.multiplex_max_streams)
    if (c.multiplex_brutal_enabled === '1') {
        const brutal = new BrutalConfig()
        if (c.multiplex_brutal_up_mbps) brutal.up_mbps = parseInt(c.multiplex_brutal_up_mbps)
        if (c.multiplex_brutal_down_mbps) brutal.down_mbps = parseInt(c.multiplex_brutal_down_mbps)
        m.brutal = brutal
    }
    return m
}

const vlessProtocol: SingBoxProtocol = {
    type: 'vless',
    build(config: ProxyNode): Outbound {
        const c = config as VlessConfig
        const outbound = new VlessOutbound(
            c.name, c.server, parseInt(c.server_port), c.uuid,
            c.tls_server_name || c.server
        )
        if (c.flow) outbound.flow = c.flow as 'xtls-rprx-vision'
        if (c.network) outbound.network = c.network as 'tcp' | 'udp'
        if (c.packet_encoding) outbound.packet_encoding = c.packet_encoding as 'packetaddr' | 'xudp'
        outbound.tls.insecure = c.tls_insecure === '1'
        if (c.tls_reality_enabled === '1' && c.tls_reality_public_key) {
            outbound.tls.reality = {
                enabled: true,
                public_key: c.tls_reality_public_key,
                short_id: c.tls_reality_short_id || ''
            }
        }
        if (c.transport_type) outbound.transport = buildTransport(c)
        if (c.multiplex_enabled === '1') outbound.multiplex = buildMultiplex(c)
        return outbound
    }
}

singboxRegistry.register(vlessProtocol)
```

- [ ] **Step 5: Create `ts-src/core/singbox/protocols/tuic.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import { TuicConfig } from '../../../module/luci'
import { TlsConfig, type Outbound, type Server } from '../models'
import { singboxRegistry, type SingBoxProtocol } from './protocol'

export class TuicOutbound implements Server, Outbound {
    type = 'tuic'
    tag: string
    server: string
    server_port: number
    uuid: string
    password: string
    congestion_control?: 'bbr' | 'cubic' | 'new_reno'
    udp_relay_mode?: 'native' | 'quic'
    udp_over_stream?: boolean
    zero_rtt_handshake?: boolean
    heartbeat?: string
    network?: 'tcp' | 'udp'
    tls: TlsConfig

    constructor(
        tag: string, server: string, server_port: number,
        uuid: string, password: string, serverName: string
    ) {
        this.tag = tag
        this.server = server
        this.server_port = server_port
        this.uuid = uuid
        this.password = password
        this.tls = new TlsConfig(serverName)
    }
}

const tuicProtocol: SingBoxProtocol = {
    type: 'tuic',
    build(config: ProxyNode): Outbound {
        const c = config as TuicConfig
        const outbound = new TuicOutbound(
            c.name, c.server, parseInt(c.server_port),
            c.uuid, c.password, c.tls_server_name || c.server
        )
        if (c.congestion_control) outbound.congestion_control = c.congestion_control as 'bbr' | 'cubic' | 'new_reno'
        if (c.udp_relay_mode) outbound.udp_relay_mode = c.udp_relay_mode as 'native' | 'quic'
        if (c.udp_over_stream === '1') outbound.udp_over_stream = true
        if (c.zero_rtt_handshake === '1') outbound.zero_rtt_handshake = true
        if (c.heartbeat) outbound.heartbeat = c.heartbeat
        if (c.network) outbound.network = c.network as 'tcp' | 'udp'
        outbound.tls.insecure = c.tls_insecure === '1'
        return outbound
    }
}

singboxRegistry.register(tuicProtocol)
```

- [ ] **Step 6: Create `ts-src/core/singbox/protocols/shadowtls.ts`**

```typescript
import type { ProxyNode } from '../../../module/luci'
import { ShadowTLSConfig } from '../../../module/luci'
import { TlsConfig, type Outbound, type Server } from '../models'
import { singboxRegistry, type SingBoxProtocol } from './protocol'

export class ShadowTLSOutbound implements Server, Outbound {
    type = 'shadowtls'
    tag: string
    server: string
    server_port: number
    version: number
    password?: string
    tls: TlsConfig

    constructor(tag: string, server: string, server_port: number, version: number, serverName: string) {
        this.tag = tag
        this.server = server
        this.server_port = server_port
        this.version = version
        this.tls = new TlsConfig(serverName)
    }
}

const shadowtlsProtocol: SingBoxProtocol = {
    type: 'shadowtls',
    build(config: ProxyNode): Outbound {
        const c = config as ShadowTLSConfig
        const outbound = new ShadowTLSOutbound(
            c.name, c.server, parseInt(c.server_port),
            parseInt(c.version), c.tls_server_name || c.server
        )
        if (c.password) outbound.password = c.password
        outbound.tls.insecure = c.tls_insecure === '1'
        return outbound
    }
}

singboxRegistry.register(shadowtlsProtocol)
```

- [ ] **Step 7: Type check**

```bash
cd ts-src && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add ts-src/core/singbox/protocols/
git commit -m "feat: add core/singbox protocol interface and adapters (hysteria2, shadowsocks, vless, tuic, shadowtls)"
```

---

## Task 7: core/singbox/protocols/registry.ts + core/singbox/builder.ts

**Files:**
- Create: `ts-src/core/singbox/protocols/registry.ts`
- Create: `ts-src/core/singbox/builder.ts`

- [ ] **Step 1: Create `ts-src/core/singbox/protocols/registry.ts`**

```typescript
// Register all supported singbox protocols.
// Adding a new protocol: create its file, then add one import here.
import './hysteria2'
import './shadowsocks'
import './vless'
import './tuic'
import './shadowtls'
```

- [ ] **Step 2: Create `ts-src/core/singbox/builder.ts`**

```typescript
import './protocols/registry'
import uci from 'uci'
import {
    BlockOutbound, DirectOutbound, DNS, DnsInbound, DnsRule, DnsServer,
    Log, Outbound, RemoteRuleSet, LocalRuleSet, Route, RouteRule, RuleSet,
    SocksInbound, SocksOutbound, TproxyInbound, URLTest
} from './models'
import { ShuntUtils } from '../../utils/common'
import { LuciFlied, ShuntTag } from '../../enum/hijpass'
import { SingBoxEnum } from '../../enum/singbox'
import { ProxyNode, RuleDTO, RuleSetDTO, ShuntConfigUtils } from '../../module/luci'
import { singboxRegistry } from './protocols/protocol'

export const SingBoxUtils: ShuntConfigUtils & { writeGeoRule: () => void } = {
    genShuntConf: genConf,
    genProxyConf,
    writeGeoRule
}

function genConf() {
    const shuntSection = ShuntUtils.getShuntSection()
    if (!shuntSection) return

    const dnsServerMap = new Map<string, DnsServer>()
    const ruleSetMap = new Map<string, RuleSet>()
    const dnsConf = shuntSection.dns
    const routeConf = shuntSection.route
    const route = new Route(transOutTag(routeConf.defaultProxyNode), dnsConf.defaultDnsNode)
    const dns = new DNS(
        dnsConf.defaultDnsNode,
        transDnsStrategy(dnsConf.defaultStrategy),
        dnsConf.useCache === '1'
    )

    dnsConf.nodes.forEach(function (dnsNode) {
        const server = new DnsServer(dnsNode.type, dnsNode.tag, dnsNode.server, parseInt(dnsNode.port, 10), undefined)
        dnsServerMap.set(dnsNode.tag, server)
    })

    let outbounds: any[] = [
        new DirectOutbound(SingBoxEnum.DIRECT_OUTBOUND_TAG),
        new BlockOutbound(SingBoxEnum.BLOCK_OUTBOUND_TAG)
    ]

    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section) {
        if (section.enabled === '1') {
            outbounds.push(new SocksOutbound('127.0.0.1', Number(section.socks_port), section.name))
        }
    })

    if (shuntSection.loadBalance.lbNodeList.length > 0) {
        const lbConf = shuntSection.loadBalance
        const testNode = new URLTest(
            SingBoxEnum.LOAD_BALANCE_OUTBOUND_TAG,
            lbConf.url || undefined,
            lbConf.interval || undefined,
            lbConf.tolerance ? parseInt(lbConf.tolerance, 10) : undefined,
            lbConf.idleTimeout || undefined,
            lbConf.interruptExistConnections === '1' ? true : undefined
        )
        testNode.outbounds = lbConf.lbNodeList
        outbounds.push(testNode)
    }

    const inbounds = [
        new TproxyInbound(parseInt(shuntSection.shuntListenPort, 10), SingBoxEnum.TPROXY_INBOUND_TAG),
        new DnsInbound(parseInt(shuntSection.dnsListenPort, 10), SingBoxEnum.DNS_INBOUND_TAG)
    ]

    if (route.default_domain_resolver && route.final) {
        const dnsTmpl = dnsServerMap.get(route.default_domain_resolver)
        if (!dnsTmpl) throw new Error('Default DNS template not found: ' + route.default_domain_resolver)
        dns.servers.push(genDnsFromTmpl(dnsTmpl.tag, route.final, dnsTmpl))
    }

    if (routeConf.rulesetOutNode) {
        const outTag = transOutTag(routeConf.rulesetOutNode)
        const node = outbounds.find(o => o.tag === outTag)
        if (node) {
            const rulesetOutNode = structuredClone(node)
            rulesetOutNode.tag = SingBoxEnum.RULESET_OUTBOUND_TAG
            if (dnsConf.rulesetDnsNode) {
                rulesetOutNode.domain_resolver = SingBoxEnum.RULESET_DNS_NAME
                const dnsTmpl = dnsServerMap.get(dnsConf.rulesetDnsNode)
                dns.servers.push(genDnsFromTmpl(SingBoxEnum.RULESET_DNS_NAME, SingBoxEnum.RULESET_OUTBOUND_TAG, dnsTmpl))
            }
            outbounds.push(rulesetOutNode)
        }
    }

    routeConf.rules.forEach(function (routeRule) {
        if (routeRule.enabled !== '1') return
        const luciRuleDTO = ShuntUtils.parseRuleList(routeRule)

        if (routeConf.rulesetConvert === '1') convertGeoRule(luciRuleDTO)

        if (luciRuleDTO.isEmpty('set')) throw new Error('Empty rule: ' + routeRule.name)

        for (const rs of luciRuleDTO.ruleSet) {
            ruleSetMap.set(rs.tag, genRuleSet(rs, routeConf.rulesetOutNode ? SingBoxEnum.RULESET_OUTBOUND_TAG : undefined))
        }

        let action = 'route'
        let outbound = transOutTag(routeRule.proxyNode)
        if (routeRule.proxyNode === ShuntTag.BLOCK_OUTBOUND_TAG) {
            action = 'reject'
            outbound = undefined
        }
        route.rules.push(new RouteRule(action, outbound).initRule(luciRuleDTO))

        if (action === 'reject') return

        if (luciRuleDTO.containDomain() || luciRuleDTO.containIp() || luciRuleDTO.containRuleSet()) {
            const dnsTag = routeRule.dnsNode
            const detour = transOutTag(routeRule.dnsProxyNode) || outbound
            const dnsTmpl = dnsTag
                ? dnsServerMap.get(dnsTag)
                : dnsServerMap.get(route.default_domain_resolver)
            dns.servers.push(genDnsFromTmpl(transDnsTag(routeRule.name), detour, dnsTmpl))
            dns.rules.push(
                new DnsRule(action, transDnsTag(routeRule.name), transDnsStrategy(routeRule.dnsStrategy))
                    .initRule(luciRuleDTO)
            )
        }
    })

    ruleSetMap.forEach(value => route.rule_set.push(value))

    return {
        log: new Log(shuntSection.logLevel),
        inbounds,
        outbounds,
        dns,
        route
    }
}

function genProxyConf(proxyNode: ProxyNode): {} {
    return {
        log: { disabled: false, level: 'info', timestamp: true },
        dns: { servers: [{ type: 'local', tag: 'local' }] },
        inbounds: [
            new TproxyInbound(Number(proxyNode.listen_port), 'tproxy-in', '127.0.0.1'),
            new SocksInbound(Number(proxyNode.socks_port), 'socks-in', '127.0.0.1')
        ],
        outbounds: [singboxRegistry.build(proxyNode.type, proxyNode)]
    }
}

function writeGeoRule() {
    const routeConf = ShuntUtils.getRouteSection()
    const geoSiteSet = new Set<string>()
    const geoIpSet = new Set<string>()
    for (const rule of routeConf.rules) {
        const luciRuleDTO = ShuntUtils.parseRuleList(rule)
        for (const geo of luciRuleDTO.geoSite) geoSiteSet.add(geo.replace('geosite:', ''))
        for (const geo of luciRuleDTO.geoIp) geoIpSet.add(geo.replace('geoip:', ''))
    }
    const geoSiteList = [...geoSiteSet]
    const geoIpList = [...geoIpSet]
    const originalIps = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geoip_ruleset') ?? []
    const originalSites = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geosite_ruleset') ?? []

    if (geoIpList.length > 0) {
        if (!isArrEqual(originalIps, geoIpList)) {
            uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geoip_ruleset', geoIpList)
        }
    } else {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geoip_ruleset', undefined)
    }
    if (geoSiteList.length > 0) {
        if (!isArrEqual(originalSites, geoSiteList)) {
            uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geosite_ruleset', geoSiteList)
        }
    } else {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geosite_ruleset', undefined)
    }
}

function genDnsFromTmpl(tag: string, detour: string, tmpl: DnsServer): DnsServer {
    return new DnsServer(tmpl.type, tag, tmpl.server, tmpl.port, detour)
}

function genRuleSet(rs: RuleSetDTO, detour: string): RuleSet {
    if (rs.type === 'remote') return new RemoteRuleSet(rs.tag, rs.format, rs.pathOrUrl, detour, undefined)
    return new LocalRuleSet(rs.tag, rs.format, rs.pathOrUrl)
}

function transDnsStrategy(strategy: string) {
    switch (strategy) {
        case '4': return 'ipv4_only'
        case '6': return 'ipv6_only'
        case '64': return 'prefer_ipv6'
        case '46': return 'prefer_ipv4'
        default: return undefined
    }
}

function transOutTag(tag: string) {
    if (tag === ShuntTag.BLOCK_OUTBOUND_TAG) return SingBoxEnum.BLOCK_OUTBOUND_TAG
    if (tag === ShuntTag.DIRECT_OUTBOUND_TAG) return SingBoxEnum.DIRECT_OUTBOUND_TAG
    if (tag === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG) return SingBoxEnum.LOAD_BALANCE_OUTBOUND_TAG
    return tag
}

function transDnsTag(name: string) { return name + '-dns' }

function convertGeoRule(luciRuleDTO: RuleDTO) {
    luciRuleDTO.ruleSet = []
    for (const geo of luciRuleDTO.geoSite) {
        const tag = geo.replace('geosite:', 'geosite-')
        luciRuleDTO.ruleSet.push({ tag, type: 'local', format: 'binary', pathOrUrl: '/etc/hijpass/ruleset/' + tag + '.srs' })
    }
    for (const geo of luciRuleDTO.geoIp) {
        const tag = geo.replace('geoip:', 'geoip-')
        luciRuleDTO.ruleSet.push({ tag, type: 'local', format: 'binary', pathOrUrl: '/etc/hijpass/ruleset/' + tag + '.srs' })
    }
}

function isArrEqual(arr1: any[], arr2: any[]) {
    if (!arr1 || !arr2) return false
    return arr1.length === arr2.length && arr1.every((val, i) => val === arr2[i])
}
```

- [ ] **Step 3: Type check**

```bash
cd ts-src && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add ts-src/core/singbox/protocols/registry.ts ts-src/core/singbox/builder.ts
git commit -m "feat: add core/singbox registry and builder — singbox core complete"
```

---

## Task 8: Wire up factory.ts, delete old files, verify build

**Files:**
- Modify: `ts-src/utils/factory.ts`
- Delete: `ts-src/module/xray.ts`, `ts-src/module/singbox.ts`, `ts-src/utils/xray/`, `ts-src/utils/singbox/`

- [ ] **Step 1: Update `ts-src/utils/factory.ts`**

```typescript
import { ShuntConfigUtils, ProxyNode } from '../module/luci'
import { SingBoxUtils } from '../core/singbox/builder'
import { XrayUtils } from '../core/xray/builder'

export const FactoryType = {
    SING_BOX: 'sing-box',
    XRAY: 'xray',
} as const

export const ShuntConfFactory = {
    getShuntUtils: function (type: string): ShuntConfigUtils {
        switch (type) {
            case FactoryType.SING_BOX: return SingBoxUtils
            case FactoryType.XRAY: return XrayUtils
        }
    }
}

export const LuciConverterFactory = {
    genProxyConf: function (type: string, proxyNode: ProxyNode): {} {
        switch (type) {
            case FactoryType.SING_BOX: return SingBoxUtils.genProxyConf(proxyNode)
            case FactoryType.XRAY: return XrayUtils.genProxyConf(proxyNode)
        }
    }
}
```

- [ ] **Step 2: Type check before deleting old files**

```bash
cd ts-src && npx tsc --noEmit
```
Expected: no errors. If errors reference `module/xray.ts` or `module/singbox.ts`, find which file still imports them and fix it before proceeding.

- [ ] **Step 3: Delete old files**

```bash
rm ts-src/module/xray.ts
rm ts-src/module/singbox.ts
rm -rf ts-src/utils/xray/
rm -rf ts-src/utils/singbox/
```

- [ ] **Step 4: Type check again**

```bash
cd ts-src && npx tsc --noEmit
```
Expected: no errors. If there are "module not found" errors, a file still has an old import — fix it.

- [ ] **Step 5: Full bundle verification**

```bash
cd ts-src && node build.mjs
```
Expected output (one line per view):
```
Build luci snippet: ../root/www/luci-static/resources/view/hijpass/dns.js
Build luci snippet: ../root/www/luci-static/resources/view/hijpass/firewall.js
Build luci snippet: ../root/www/luci-static/resources/view/hijpass/log.js
Build luci snippet: ../root/www/luci-static/resources/view/hijpass/overview.js
Build luci snippet: ../root/www/luci-static/resources/view/hijpass/proxy.js
Build luci snippet: ../root/www/luci-static/resources/view/hijpass/rule.js
Build luci snippet: ../root/www/luci-static/resources/view/hijpass/server.js
Build luci snippet: ../root/www/luci-static/resources/view/hijpass/shunt.js
```
No errors. Process exits 0.

- [ ] **Step 6: Commit**

```bash
git add ts-src/utils/factory.ts
git rm ts-src/module/xray.ts ts-src/module/singbox.ts
git rm -r ts-src/utils/xray/ ts-src/utils/singbox/
git commit -m "refactor: migrate xray/singbox to core/ protocol registry, delete old files"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec sections covered — `core/xray/`, `core/singbox/`, protocol interface, registry, builder, factory update, deletions.
- [x] **Placeholders:** The `require` placeholder in Task 4 builder.ts is corrected in the note immediately below it — the actual import is at the top of the file.
- [x] **Type consistency:** `xrayRegistry` used in `builder.ts` matches the export from `protocols/protocol.ts`. `SingBoxUtils` exported from `builder.ts` matches the import in `factory.ts`. `ShuntConfigUtils` interface is `{ genShuntConf, genProxyConf }` — `writeGeoRule` is added as an intersection type extension in the singbox builder export type.
- [x] **`writeGeoRule` in factory:** `factory.ts` does not call `writeGeoRule` directly — it's called from views. The singbox builder exports `SingBoxUtils` with `writeGeoRule` attached. Views that call `SingBoxUtils.writeGeoRule()` will still work since the export includes it.
