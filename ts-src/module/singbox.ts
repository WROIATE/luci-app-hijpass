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
        this.disable_cache = cache
        this.disable_expire = cache
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

export class Outbound {
    type: string;
    tag: string;

    constructor(type: string, tag: string) {
        this.type = type
        this.tag = tag
    }
}

export class BlockOutbound extends Outbound {
    constructor(tag: string) {
        super('block', tag);
    }
}

export class DirectOutbound extends Outbound {
    constructor(tag: string) {
        super('direct', tag);
    }
}

export class Socks extends Outbound {
    server: string;
    server_port: number;
    version: string;

    constructor(server: string, server_port: number, tag: string) {
        super('socks', tag);
        this.server = server
        this.server_port = server_port
        this.version = '5'
    }
}

export class URLTest extends Outbound {
    url: string;
    interval: number;
    tolerance: number;
    idle_timeout: number;
    interrupt_exist_connections: boolean;
    outbounds: string[];

    constructor(tag: string, url: string, interval: number, tolerance: number, idle_timeout: number, interrupt_exist_connections: boolean) {
        super('urltest', tag)
        this.outbounds = []
        this.url = url
        this.interval = interval
        this.tolerance = tolerance
        this.idle_timeout = idle_timeout
        this.interrupt_exist_connections = interrupt_exist_connections
    }
}

export class Inbound {
    type: string;
    tag: string;
    listen: string;
    listen_port: number;

    constructor(type: string, port: number, tag: string) {
        this.type = type
        this.tag = tag
        this.listen = "::"
        this.listen_port = port
    }
}

export class TproxyInbound extends Inbound {
    constructor(port: number, tag: string) {
        super("tproxy", port, tag)
    }
}

export class DnsInbound extends Inbound {
    constructor(port: number, tag: string) {
        super("direct", port, tag)
    }
}
