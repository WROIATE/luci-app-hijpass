import {XrayEnum} from "../enum/xrayEnum";

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
            case "tls":
                this.address = "tls://" + address
                this.port = port
                break
        }
        this.tag = tag
        this.domains = []
        this.skipFallback = true
        this.disableCache = true
    }
}

// DNS Global Template
class DNS {
    servers: DnsServer[];
    rules: DnsRule[];
    queryStrategy: string;
    disableCache: boolean;
    disableFallback: boolean;
    disableFallbackIfMatch: boolean;

    constructor(queryStrategy: string) {
        this.servers = []
        this.rules = []
        this.queryStrategy = queryStrategy || XrayEnum.DEFAULT_DNS_STRATEGY
        this.disableCache = true
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
        this.inboundTag = [XrayEnum.TPORXY_INBOUND_TAG]
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

class Outbound {
    settings: any;
    protocol: string;
    tag: string;

    constructor(protocol: string, tag: string) {
        this.protocol = protocol
        this.tag = tag
    }
}

class Socks extends Outbound {
    constructor(address: string, port: number, tag: string) {
        super('socks', tag);
        this.settings = {
            address: address,
            port: port
        }
    }
}

class DnsOutbound extends Outbound {
    constructor(tag: string) {
        super('dns', tag);
        this.settings = {
            nonIPQuery: "reject"
        }
    }
}

class Freedom extends Outbound {
    constructor(tag: string) {
        super('freedom', tag);
        this.settings = {
            domainStrategy: XrayEnum.DEFAULT_DNS_STRATEGY
        }
    }
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
        interval: string;
        timeout: string;
        sampling: number;
    };

    constructor(url: string, interval: string, timeout: string, sampling: number) {
        this.subjectSelector = []
        this.pingConfig = {
            destination: url ? url : "https://connectivitycheck.gstatic.com/generate_204",
            interval: interval ? interval : "60s",
            timeout: timeout ? timeout : "2s",
            sampling: sampling ? sampling : 3
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
    Balancer,
    BurstObservatory,
}