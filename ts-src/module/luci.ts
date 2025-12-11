export class DnsNode {
    tag: string;
    type: string;
    server: string;
    port: string;
}

export class DnsSection {
    defaultDnsNode: string;
    defaultStrategy: string;
    useCache: string;
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
    ipCidr: string[];

    network: string[];
    protocol: string[];
    port: number[];
    portRange: string[];

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

    containDomain(): boolean {
        return this.domain.length > 0
            || this.domainRegex.length > 0
            || this.domainRegex.length > 0
            || this.domainKeyword.length > 0
    }

    containGeo(): boolean {
        return this.geoSite.length > 0 || this.geoIp.length > 0
    }

    containRuleSet(): boolean {
        return this.ruleSet.length > 0
    }

    containIp(): boolean {
        return this.ipCidr.length > 0
            || this.geoIp.length > 0
    }

    isEmpty(collectionType: "geo" | "set"): boolean {
        return !(this.containDomain()
            || this.containIp()
            || (collectionType === "geo" && this.containGeo())
            || (collectionType === "set" && this.containRuleSet())
            || this.network.length > 0
            || this.port.length > 0
            || this.portRange.length > 0
            || this.protocol.length > 0)
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