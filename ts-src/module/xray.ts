import {XrayEnum} from "../enum/xray";

class Log {
    loglevel: string;
    dnsLog: boolean;

    constructor(logLevel: string) {
        this.loglevel = logLevel || XrayEnum.DEFAULT_LOG_LEVEL
        this.dnsLog = false
    }
}

// DNS Server Template
class DnsServer {
    tag: string;
    address: string;
    port: number;
    queryStrategy: string;
    domains: string[];
    skipFallback: boolean;
    disableCache: boolean;

    constructor(type: string, tag: string, address: string, port: number) {
        switch (type) {
            case "tcp":
                this.address = "tcp://" + address
                this.port = port
                break
            case "https":
                this.address = "https://" + address
                if (port) {
                    this.address += ":" + port
                }
                this.address += "/dns-query"
                break
            case "quic":
                this.address = "quic://" + address
                this.port = port
                break
            case "udp":
                this.address = address
                this.port = port
                break
            default:
                throw new Error("Invalid xray DNS server type: " + type)
        }
        this.tag = tag
        this.domains = []
        this.skipFallback = true
    }
}

// DNS Global Template
class DNS {
    servers: DnsServer[];
    rules: DnsRule[];
    queryStrategy: string;
    disableCache: boolean;
    serveStale: boolean;
    serveExpiredTTL: number;
    disableFallback: boolean;
    disableFallbackIfMatch: boolean;

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

class Rule {
    ruleTag: string;
    inboundTag: string[];
    outboundTag: string;
    balancerTag: string;

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

class RouteRule extends Rule {
    domain: string[];
    network: string[];
    ip: string[];
    protocol: string[];
    port: string;

    constructor(tag: string, outbound: string) {
        super(tag, undefined, outbound)
        this.inboundTag = [XrayEnum.TPROXY_INBOUND_TAG]
        this.domain = []
        this.network = []
        this.ip = []
        this.protocol = []
    }
}

class DnsRule extends Rule {
    constructor(tag: string[], outbound: string) {
        super(undefined, tag, outbound)
    }
}

// Route Global Template
class Route<T extends Rule> {
    rules: T[];
    domainStrategy: string;
    balancers: Balancer[];

    constructor() {
        this.rules = []
        this.domainStrategy = 'AsIs'
        this.balancers = []
    }
}

// Outbound 接口
interface Outbound {
    settings?: any;
    protocol: string;
    tag: string;
    streamSettings?: any;
}

class BlockOutbound implements Outbound {
    settings?: any;
    protocol: string;
    tag: string;
    streamSettings?: any;

    constructor(tag: string) {
        this.protocol = 'blackhole';
        this.tag = tag;
    }
}

class Socks implements Outbound {
    settings: any;
    protocol: string;
    tag: string;

    constructor(address: string, port: number, tag: string) {
        this.protocol = 'socks';
        this.tag = tag;
        this.settings = {
            address: address,
            port: port
        }
    }
}

class DnsOutbound implements Outbound {
    settings: any;
    protocol: string;
    tag: string;

    constructor(tag: string) {
        this.protocol = 'dns';
        this.tag = tag;
        this.settings = {
            nonIPQuery: "reject"
        }
    }
}

class Freedom implements Outbound {
    settings: any;
    protocol: string;
    tag: string;

    constructor(tag: string) {
        this.protocol = 'freedom';
        this.tag = tag;
        this.settings = {
            domainStrategy: XrayEnum.DEFAULT_DNS_STRATEGY
        }
    }
}

// Hysteria2 传输配置
// 参考文档: https://xtls.github.io/config/transports/hysteria.html
interface HysteriaSettings {
    version: 2;
    auth: string;
    udpIdleTimeout?: number;
}

// Hysteria2 streamSettings
interface Hysteria2StreamSettings {
    network: 'hysteria';
    security: 'tls';
    tlsSettings: TlsObject;
    hysteriaSettings: HysteriaSettings;
}

// Hysteria2 出站类
// 参考文档: https://xtls.github.io/config/outbounds/hysteria.html
// 参考文档: https://xtls.github.io/config/transports/hysteria.html
class Hysteria2Outbound implements Outbound {
    settings: {
        version: 2;
        address: string;
        port: number;
    };
    protocol: string;
    tag: string;
    streamSettings: Hysteria2StreamSettings;

    constructor(
        address: string,
        port: number,
        tag: string,
        password: string,
        serverName: string,
        allowInsecure: boolean = false,
        udpIdleTimeout?: number,
    ) {
        this.protocol = 'hysteria';
        this.tag = tag;
        this.settings = {
            version: 2,
            address: address,
            port: port,
        };
        this.streamSettings = {
            network: 'hysteria',
            security: 'tls',
            tlsSettings: {
                serverName: serverName,
                allowInsecure: allowInsecure,
                alpn: ['h3'],   // Hysteria2 over QUIC 必须协商 h3，否则 CRYPTO_ERROR 0x178
            },
            hysteriaSettings: {
                version: 2,
                auth: password,
                ...(udpIdleTimeout !== undefined ? { udpIdleTimeout } : {}),
            },
        };
    }
}

// Shadowsocks 出站类
// 参考文档: https://xtls.github.io/config/outbounds/shadowsocks.html
class ShadowsocksXrayOutbound implements Outbound {
    settings: {
        address: string;
        port: number;
        method: string;
        password: string;
        uot?: boolean;
        level: number;
    };
    protocol: string;
    tag: string;

    constructor(address: string, port: number, tag: string, method: string, password: string, uot?: boolean) {
        this.protocol = 'shadowsocks';
        this.tag = tag;
        this.settings = {
            address,
            port,
            method,
            password,
            uot: uot || undefined,
            level: 0,
        };
    }
}

// VLESS 出站类
// 参考文档: https://xtls.github.io/config/outbounds/vless.html
class VlessOutbound implements Outbound {
    settings: any;
    protocol: string;
    tag: string;
    streamSettings?: any;

    constructor(
        address: string,
        port: number,
        id: string,
        tag: string,
        encryption: string = 'none',
        flow?: string,
        level: number = 0
    ) {
        this.protocol = 'vless';
        this.tag = tag;
        this.settings = {
            address: address,
            port: port,
            id: id,
            encryption: encryption,
            level: level
        };

        // 如果指定了 flow (XTLS 流控)，添加到设置
        if (flow) {
            this.settings.flow = flow;
        }
    }
}

// Xray StreamSettings 配置对象
// 参考: https://xtls.github.io/config/transport.html#streamsettingsobject
interface VlessStreamSettings {
    network?: string;
    security: string;
    xhttpSettings?: XHTTPObject;
    wsSettings?: WsObject;
    grpcSettings?: GrpcObject;
    httpSettings?: HttpObject;
    httpupgradeSettings?: HttpUpgradeObject;
    realitySettings?: RealityObject;
    tlsSettings?: TlsObject;
    sockopt?: SockoptObject;
}

interface WsObject {
    path?: string;
    headers?: Record<string, string>;
    heartbeatPeriod?: number;
}

interface GrpcObject {
    serviceName?: string;
    multiMode?: boolean;
    authority?: string;
    user_agent?: string;
    idle_timeout?: number;
    health_check_timeout?: number;
    permit_without_stream?: boolean;
    initial_windows_size?: number;
}

interface HttpObject {
    host?: string[];
    path?: string;
    method?: string;
}

interface HttpUpgradeObject {
    host?: string;
    path?: string;
    headers?: Record<string, string>;
}

// XHTTP 配置
interface XHTTPObject {
    host?: string;
    path?: string;
    mode?: string;
}

interface TlsObject {
    serverName: string;
    allowInsecure?: boolean;
    alpn?: string[];
}

// Reality 配置对象（仅服务端）
interface RealityObject {
    show?: boolean;
    target?: string;
    xver?: number;
    serverNames?: string[];
    privateKey?: string;
    minClientVer?: string;
    maxClientVer?: string;
    maxTimeDiff?: number;
    shortIds?: string[];
    mldsa65Seed?: string;
    // 客户端参数
    fingerprint?: string;
    serverName?: string;
    password?: string;
    shortId?: string;
    mldsa65Verify?: string;
    spiderX?: string;
}

// Socket 选项对象
interface SockoptObject {
    mark?: number;
    tcpMaxSeg?: number;
    tcpFastOpen?: boolean | number;
    tproxy?: string;
    domainStrategy?: string;
    dialerProxy?: string;
    acceptProxyProtocol?: boolean;
    tcpKeepAliveInterval?: number;
    tcpKeepAliveIdle?: number;
    tcpUserTimeout?: number;
    tcpCongestion?: string;
    interface?: string;
    v6only?: boolean;
    tcpWindowClamp?: number;
    tcpMptcp?: boolean;
}

class Balancer {
    tag: string;
    selector: string[];
    fallbackTag: string;
    strategy: {
        type: string;
        settings: {
            expected: number;
            maxRTT: string;
            tolerance: number;
        };
    };

    constructor(tag: string) {
        this.tag = tag
        this.selector = []
        this.fallbackTag = undefined
        this.strategy = {
            type: "leastLoad",
            settings: {
                expected: 1,
                maxRTT: "1s",
                tolerance: 0.05
            }
        }
    }
}

class BurstObservatory {
    subjectSelector: string[];
    pingConfig: {
        destination: string;
        connectivity: string;
        interval: string;
        timeout: string;
        sampling: number;
        httpMethod: string;
    };

    constructor(destination: string, connectivity: string, interval: string, timeout: string, sampling: number, httpMethod: string) {
        this.subjectSelector = []
        this.pingConfig = {
            destination: destination || "https://connectivitycheck.gstatic.com/generate_204",
            connectivity: connectivity || undefined,
            interval: interval || "60s",
            timeout: timeout || "2s",
            sampling: sampling || 3,
            httpMethod: httpMethod || undefined,
        }
    }
}

class Inbound {
    protocol: string
    tag: string
    port: number
    settings: any
    streamSettings: any
    sniffing: any

    constructor(type: string, port: number, tag: string) {
        this.protocol = "dokodemo-door"
        this.tag = tag
        this.port = port
        this.settings = {
            network: "tcp,udp",
            followRedirect: undefined
        }
        if (type === "tproxy") {
            this.settings.followRedirect = true
            this.streamSettings = {
                sockopt: {
                    tproxy: "tproxy"
                }
            }
            this.sniffing = {
                enabled: true,
                destOverride: ["http", "tls", "quic"],
                routeOnly: true
            }
        }
    }
}

export {
    Log,
    DNS,
    DnsServer,
    DnsRule,
    Route,
    Rule,
    RouteRule,
    Inbound,
    Outbound,
    Socks,
    DnsOutbound,
    Freedom,
    VlessOutbound,
    VlessStreamSettings,
    XHTTPObject,
    RealityObject,
    SockoptObject,
    Balancer,
    BlockOutbound,
    BurstObservatory,
    Hysteria2Outbound,
    HysteriaSettings,
    Hysteria2StreamSettings,
    ShadowsocksXrayOutbound,
}