import {SingBoxEnum} from "../enum/singbox";
import {RuleDTO} from "./luci";

export class Log {
    disabled: boolean;
    level: string;
    timestamp: boolean;

    constructor(logLevel: string) {
        this.disabled = false
        this.level = logLevel || SingBoxEnum.DEFAULT_LOG_LEVEL
        this.timestamp = true
    }
}

// DNS Server Template
export class DnsServer {
    type: string;
    tag: string;
    server: string;
    port: number;
    detour: string;

    constructor(type: string, tag: string, server: string, port: number, detour: string) {
        this.type = type
        this.tag = tag
        this.server = server
        this.port = port
        if (detour === SingBoxEnum.DIRECT_OUTBOUND_TAG) {
            this.detour = undefined
        } else {
            this.detour = detour
        }
    }
}

// DNS Global Template
export class DNS {
    servers: DnsServer[];
    rules: DnsRule[];
    strategy: string;
    disable_cache: boolean;
    disable_expire: boolean;
    final: string;

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
    action: string;
    outbound: string;

    constructor(action: string, outbound: string) {
        this.action = action
        this.outbound = outbound
    }
}

export class RouteRule extends Rule {
    protocol: string[];
    port: number[];
    port_range: string[];
    domain: string[];
    domain_suffix: string[];
    domain_keyword: string[];
    domain_regex: string[];
    rule_set: string[];
    ip_cidr: string[];
    network: string[];

    constructor(action: string, outbound: string) {
        super(action, outbound);
    }

    initRule(rule: RuleDTO): RouteRule {
        this.network = rule.network;
        this.protocol = rule.protocol;
        this.port = rule.port;
        this.port_range = rule.portRange.map(range => range.replace('-', ':'))
        this.domain = rule.domain;
        this.domain_suffix = rule.domainSuffix;
        this.domain_keyword = rule.domainKeyword;
        this.domain_regex = rule.domainRegex;
        this.rule_set = rule.ruleSet.map((r) => r.tag);
        this.ip_cidr = rule.ipCidr;
        return this
    }
}

export class DnsRule extends Rule {
    domain: string[];
    domain_keyword: string[];
    domain_regex: string[];
    domain_suffix: string[];
    rule_set: string[];

    server: string;
    strategy: string;
    disable_cache: boolean;
    disable_expire: boolean;

    constructor(action: string, server: string, strategy: string) {
        super(action, undefined);
        this.action = action
        this.server = server
        this.strategy = strategy
        this.disable_cache = true
    }

    initRule(rule: RuleDTO): DnsRule {
        this.domain = rule.domain;
        this.domain_suffix = rule.domainSuffix;
        this.domain_keyword = rule.domainKeyword;
        this.domain_regex = rule.domainRegex;
        this.rule_set = rule.ruleSet.map((r) => r.tag);
        return this
    }
}

export class SniffRule extends RouteRule {
    constructor() {
        super("sniff", undefined);
    }
}

export class HijackDnsRule extends RouteRule {
    constructor() {
        super("hijack-dns", undefined);
        this.protocol = ["dns"]
    }
}

// RuleDTO Set Template
export class RuleSet {
    type: string;
    tag: string;
    format: string;

    constructor(tag: string, type: string, format: string) {
        this.type = type
        this.tag = tag;
        this.format = format
    }
}

// RuleDTO Set Template
export class RemoteRuleSet extends RuleSet {
    url: string;
    download_detour: string;
    update_interval: number;

    constructor(tag: string, format: string, url: string, download_detour: string, update_interval: number) {
        super(tag, 'remote', format);
        this.url = url;
        this.download_detour = download_detour;
        this.update_interval = update_interval;
    }
}

// Local RuleDTO Set Template
export class LocalRuleSet extends RuleSet {
    path: string;

    constructor(tag: string, format: string, path: string) {
        super(tag, 'local', format);
        this.path = path;
    }
}

// Route Global Template
export class Route {
    rules: RouteRule[];
    rule_set: RuleSet[];
    default_domain_resolver: string;
    final: string;

    constructor(defaultProxyTag: string, resolver: string) {
        this.rules = [
            new SniffRule(),
            new HijackDnsRule()
        ]
        this.rule_set = []
        this.default_domain_resolver = resolver
        this.final = defaultProxyTag
    }
}


export interface Inbound {
    type: 'tproxy' | 'direct' | 'socks';
    tag: string;
    listen: string;
    listen_port: number;
}

export interface Listener {
    listen: string;
    listen_port: number;
}

export class TproxyInbound implements Inbound, Listener {
    type: 'tproxy' = 'tproxy';
    tag: string;
    listen: string;
    listen_port: number;

    constructor(port: number, tag: string, address?: string) {
        this.type = 'tproxy';
        this.tag = tag;
        address ? this.listen = address : this.listen = "::";
        this.listen_port = port;
    }
}

export class DnsInbound implements Inbound, Listener {
    type: 'direct' = 'direct';
    tag: string;
    listen: string;
    listen_port: number;

    constructor(port: number, tag: string) {
        this.type = 'direct';
        this.tag = tag;
        this.listen = "::";
        this.listen_port = port;
    }
}

export class SocksInbound implements Inbound, Listener {
    type: 'socks' = 'socks';
    tag: string;
    listen: string;
    listen_port: number;
    users?: [
        {
            username: string,
            password: string
        }
    ]

    constructor(port: number, tag: string, address?: string) {
        this.type = 'socks';
        this.tag = tag;
        address ? this.listen = address : this.listen = "::";
        this.listen_port = port;
    }
}

export interface Outbound {
    type: 'block' | 'direct' | 'urltest' | 'socks'
        | 'hysteria2' | 'shadowsocks' | 'tuic' | 'shadowtls' | 'vless';
    tag: string;
}

export interface Server {
    server: string;
    server_port: number;
}

export class BlockOutbound implements Outbound {
    type: 'block' = "block";
    tag: string;

    constructor(tag: string) {
        this.tag = tag
    }
}

export class DirectOutbound implements Outbound {
    type: 'direct' = 'direct';
    tag: string;
    domain_resolver: string;

    constructor(tag: string) {
        this.tag = tag;
    }
}

export class URLTest implements Outbound {
    type: 'urltest' = 'urltest';
    tag: string;
    url: string;
    interval: number;
    tolerance: number;
    idle_timeout: number;
    interrupt_exist_connections: boolean;
    outbounds: string[];

    constructor(tag: string, url: string, interval: number, tolerance: number, idle_timeout: number, interrupt_exist_connections: boolean) {
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
    type: 'socks' = 'socks';
    tag: string;
    server: string;
    server_port: number;
    version: '4' | '5' = '5';
    domain_resolver: string;

    constructor(server: string, server_port: number, tag: string) {
        this.type = 'socks';
        this.tag = tag;
        this.server = server;
        this.server_port = server_port;
        this.version = '5'
    }
}

export class Hysteria2Outbound implements Server, Outbound {
    type: 'hysteria2' = 'hysteria2';
    tag: string;
    server: string;
    server_port: number;
    password?: string;
    obfs?: ObfsConfig;
    up_mbps?: number;
    down_mbps?: number;
    server_ports?: string[];
    hop_interval?: string;
    network?: string;
    tls: TlsConfig;

    constructor(tag: string, server: string, server_port: number, serverName: string) {
        this.type = 'hysteria2';
        this.tag = tag;
        this.server = server;
        this.server_port = server_port;
        this.tls = new TlsConfig(serverName);
    }
}

export class ShadowsocksOutbound implements Server, Outbound {
    type: 'shadowsocks' = 'shadowsocks';
    tag: string;
    server: string;
    server_port: number;
    method: string;
    password: string;
    network?: 'tcp' | 'udp';
    udp_over_tcp?: boolean;
    plugin?: string;
    plugin_opts?: string;
    multiplex?: MultiplexConfig;

    constructor(tag: string, server: string, server_port: number, method: string, password: string) {
        this.type = 'shadowsocks';
        this.tag = tag;
        this.server = server;
        this.server_port = server_port;
        this.method = method;
        this.password = password;
    }
}

export class TuicOutbound implements Server, Outbound {
    type: 'tuic' = 'tuic';
    tag: string;
    server: string;
    server_port: number;
    uuid: string;
    password: string;
    congestion_control?: 'bbr' | 'cubic' | 'new_reno';
    udp_relay_mode?: 'native' | 'quic';
    udp_over_stream?: boolean;
    zero_rtt_handshake?: boolean;
    heartbeat?: string;
    network?: 'tcp' | 'udp';
    tls: TlsConfig;

    constructor(tag: string, server: string, server_port: number, uuid: string, password: string, serverName: string) {
        this.type = 'tuic';
        this.tag = tag;
        this.server = server;
        this.server_port = server_port;
        this.uuid = uuid;
        this.password = password;
        this.tls = new TlsConfig(serverName);
    }
}

export class ShadowTLSOutbound implements Server, Outbound {
    type: 'shadowtls' = 'shadowtls';
    tag: string;
    server: string;
    server_port: number;
    version: number;
    password?: string;
    tls: TlsConfig;

    constructor(tag: string, server: string, server_port: number, version: number, serverName: string) {
        this.type = 'shadowtls';
        this.tag = tag;
        this.server = server;
        this.server_port = server_port;
        this.version = version;
        this.tls = new TlsConfig(serverName);
    }
}

export class VlessOutbound implements Server, Outbound {
    type: 'vless' = 'vless';
    tag: string;
    server: string;
    server_port: number;
    uuid: string;
    flow?: 'xtls-rprx-vision';
    network?: 'tcp' | 'udp';
    packet_encoding?: 'packetaddr' | 'xudp';
    tls: TlsConfig;
    transport?: TransportConfig;
    multiplex?: MultiplexConfig;

    constructor(tag: string, server: string, server_port: number, uuid: string, serverName: string) {
        this.type = 'vless';
        this.tag = tag;
        this.server = server;
        this.server_port = server_port;
        this.uuid = uuid;
        this.tls = new TlsConfig(serverName);
    }
}

// TLS 配置类
export class TlsConfig {
    enabled: boolean;
    server_name: string;
    insecure?: boolean;
    reality?: { enabled: boolean; public_key: string; short_id: string };

    constructor(serverName: string) {
        this.enabled = true;
        this.server_name = serverName;
    }
}

// Obfuscation 配置类（用于 Hysteria2）
export class ObfsConfig {
    type: 'salamander';
    password?: string;

    constructor(password: string) {
        this.type = "salamander";
        this.password = password;
    }
}

// Brutal 配置类
export class BrutalConfig {
    enabled: boolean;
    up_mbps?: number;
    down_mbps?: number;

    constructor() {
        this.enabled = true;
    }
}

// Multiplex 配置类
export class MultiplexConfig {
    enabled: boolean;
    protocol?: "smux" | "yamux" | "h2mux";
    max_connections?: number;
    min_streams?: number;
    max_streams?: number;
    brutal?: BrutalConfig;

    constructor() {
        this.enabled = true;
    }
}

// 传输层配置类型
export interface HttpTransport {
    type: 'http';
    host?: string;
    path?: string;
    method?: string;
    idle_timeout?: string;
    ping_timeout?: string;
}

export interface WebSocketTransport {
    type: 'websocket';
    path?: string;
    max_early_data?: number;
    early_data_header_name?: string;
}

export interface GrpcTransport {
    type: 'grpc';
    service_name?: string;
    idle_timeout?: string;
    ping_timeout?: string;
    permit_without_stream?: boolean;
}

export interface HttpUpgradeTransport {
    type: 'httpupgrade';
    host?: string;
    path?: string;
}

export type TransportConfig = HttpTransport
    | WebSocketTransport
    | GrpcTransport
    | HttpUpgradeTransport
    | { type: string; [key: string]: any };