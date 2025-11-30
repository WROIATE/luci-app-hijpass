export class DnsNode {
    tag: string;
    type: string;
    server: string;
    port: string;
}

export class DnsSection {
    defaultDnsNode: string;
    defaultStrategy: string;
    nodes: DnsNode[];

    constructor() {
        this.nodes = [];
    }
}

export class ShuntRouteRule {
    enabled: string;
    name: string;
    proxyNode: string;

    protocol: string[];
    network: string[];
    port: string[];
    portRange: string[];
    domainList: string;
    ipList: string;

    dnsNode: string;
    dnsProxyNode: string;
    dnsStrategy: string;

    constructor() {
        this.port = [];
        this.portRange = [];
        this.network = [];
        this.protocol = [];
    }
}

export class RouteSection {
    defaultProxyNode: string;
    rules: ShuntRouteRule[];

    constructor() {
        this.rules = [];
    }
}

export class LoadBalanceNode {
    tag: string;
    lbNodeList: string[];
    url: string;
    interval: string;
    timeout: string

    constructor() {
        this.lbNodeList = [];
    }
}

export class ShuntSection {
    type: string;
    configType: string;
    shuntListenPort: string;
    dnsListenPort: string;
    logLevel: string;
    logPath: string;
    route: RouteSection;
    dns: DnsSection;
    loadBalance: LoadBalanceNode;
}

export class RuleDTO {
    domain: string[];
    domainRegex: string[];
    domainKeyword: string[];
    domainSuffix: string[];
    network: string[];
    ipCidr: string[];

    ruleSet: RuleSetDTO[]; // 规则集合
    geoIp: string[];
    geoSite: string[];

    constructor() {
        this.domain = [];
        this.domainRegex = [];
        this.domainKeyword = [];
        this.domainSuffix = [];
        this.ruleSet = [];
        this.ipCidr = [];
        this.geoIp = [];
        this.geoSite = [];
        this.network = [];
    }
}

export interface RuleSetDTO {
    tag: string;
    type: string;
    format: string;
    pathOrUrl: string;
}

export interface ShuntConfigUtils {
    genShuntConf: () => {}
}