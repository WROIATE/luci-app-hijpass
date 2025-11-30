'use strict';
'require uci';
'require network'
'require baseclass';
'require form';
'require ui';
'require view.hijpass.hijpass as hj'

const Enum = {
    DIRECT_OUTBOUND_TAG: "direct-out",
    BLOCK_OUTBOUND_TAG: "block",
    TPORXY_INBOUND_TAG: "tproxy-in",
    DNS_INBOUND_TAG: "dns-in",
    DNS_OUTBOUND_TAG: "dns-out",
    LOAD_BALANCE_OUTBOUND_TAG: "slb",
    DEFAULT_LOG_LEVEL: "info",
    DEFAULT_DNS_STRATEGY: "UseIP"
}

class Log {
    constructor(logLevel) {
        this.loglevel = logLevel || Enum.DEFAULT_LOG_LEVEL
        this.dnsLog = false
    }
}

// DNS Server Template
class DnsServer {
    constructor(type, tag, address, port) {
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
        this.queryStrategy = undefined
        this.domains = undefined
        this.skipFallback = true
        this.disableCache = true
    }
}

// DNS Global Template
class DNS {
    constructor(queryStrategy) {
        this.servers = []
        this.queryStrategy = queryStrategy || Enum.DEFAULT_DNS_STRATEGY
        this.disableCache = true
        this.disableFallback = false
        this.disableFallbackIfMatch = true
    }
}

class Rule {
    constructor(ruleTag, inboundTag, outbound) {
        this.ruleTag = ruleTag
        this.inboundTag = inboundTag

        if (outbound === Enum.LOAD_BALANCE_OUTBOUND_TAG) {
            this.balancerTag = outbound
        } else {
            this.outboundTag = outbound
        }
    }
}

class RouteRule extends Rule {
    constructor(tag, outbound) {
        super(tag, undefined, outbound)
        this.protocol = undefined
        this.port = undefined
        this.domain = undefined
        this.network = undefined
        this.inboundTag = [Enum.TPORXY_INBOUND_TAG]
        this.ip = undefined
    }
}

class DnsRule extends Rule {
    constructor(tag, outbound) {
        super(undefined, tag, outbound)
    }
}

// Route Global Template
class Route {
    constructor() {
        this.rules = []
        this.domainStrategy = 'AsIs'
        this.balancers = []
    }
}

class Outbound {
    constructor(protocol, tag) {
        this.protocol = protocol
        this.tag = tag
        this.settings = undefined
    }
}

class Socks extends Outbound {
    constructor(address, port, tag) {
        super('socks', tag);
        this.settings = {
            address: address,
            port: port
        }
    }
}

class DnsOutbound extends Outbound {
    constructor(tag) {
        super('dns', tag);
        this.settings = {
            nonIPQuery: "reject"
        }
    }
}

class Freedom extends Outbound {
    constructor(tag) {
        super('freedom', tag);
        this.settings = {
            domainStrategy: Enum.DEFAULT_DNS_STRATEGY
        }
    }
}

class Balancer {
    constructor(tag) {
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
    constructor(url, interval, timeout, sampling) {
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
    constructor(type, port, tag) {
        this.protocol = "dokodemo-door"
        this.tag = tag
        this.port = port
        this.settings = {
            network: "tcp,udp",
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

function genConf() {
    let shuntSection = hj.ShuntUtils.getShuntSection()

    let dnsServerMap = new Map();
    let route = new Route()

    let dnsConf = shuntSection.dns
    let dns = new DNS(transDnsStrategy(dnsConf.defaultStrategy))
    dnsConf.nodes.forEach(function (dnsNode) {
        let server = new DnsServer(dnsNode.type, dnsNode.tag, dnsNode.server, dnsNode.port, undefined, undefined)
        dnsServerMap.set(dnsNode.tag, server)
    })

    let routeConf = shuntSection.route
    let outbounds = []
    uci.sections(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.PROXY_NODE_TYPE, function (section) {
        if (section.enabled === '1') {
            let proxyNode = new Socks("127.0.0.1",
                parseInt(section.socks_port, 10), transOutTag(section.name))
            if (section.name === routeConf.defaultProxyNode) {
                outbounds.unshift(proxyNode)
            } else {
                outbounds.push(proxyNode)
            }
        }
    })
    if (routeConf.defaultProxyNode === hj.ShuntTagEnum.DIRECT_OUTBOUND_TAG) {
        outbounds.unshift(new Freedom(Enum.DIRECT_OUTBOUND_TAG))
    } else {
        outbounds.push(new Freedom(Enum.DIRECT_OUTBOUND_TAG))
    }
    outbounds.push(new Outbound('blackhole', Enum.BLOCK_OUTBOUND_TAG))

    outbounds.push(new DnsOutbound(Enum.DNS_OUTBOUND_TAG))

    let inbounds = [
        new Inbound("tproxy", parseInt(shuntSection.shuntListenPort, 10), Enum.TPORXY_INBOUND_TAG),
        new Inbound("direct", parseInt(shuntSection.dnsListenPort, 10), Enum.DNS_INBOUND_TAG)
    ]

    let dnsRules = [new DnsRule([Enum.DNS_INBOUND_TAG], Enum.DNS_OUTBOUND_TAG)]

    let routeRules = []
    let defaultDnsTmpl = dnsServerMap.get(dnsConf.defaultDnsNode)
    let dnsInOutMap = new Map()

    routeConf.rules.forEach(function (rule) {
        if (rule.enabled !== "1") {
            return
        }
        // 生成路由规则
        let ruleOutBoundTag = transOutTag(rule.proxyNode)
        ruleOutBoundTag = ruleOutBoundTag ? ruleOutBoundTag : outbounds[0].tag
        let routeRule = new RouteRule(rule.name, ruleOutBoundTag)
        routeRule.network = rule.network
        routeRule.protocol = transRouteProtocol(rule.protocol)
        routeRule.port = (rule.port || []).join(',')
        if (routeRule.portRange) {
            routeRule.port = routeRule.port + "," + rule.portRange.join(',')
        }
        if (routeRule.port === "") {
            routeRule.port = undefined
        }

        let domainMap = hj.ShuntUtils.parseRuleList(rule.domainList, 'domain');
        let ipMap = hj.ShuntUtils.parseRuleList(rule.ipList, 'ip');
        const domainArrays = [
            addPrefixToElements(domainMap.domain, 'full:'),
            addPrefixToElements(domainMap.domainSuffix, 'domain:'),
            domainMap.domainKeyword,
            addPrefixToElements(domainMap.domainRegex, 'regexp:'),
            domainMap.geoSite
        ];
        const ipArrays = [
            ipMap.ipCidr,
            ipMap.geoIp
        ]
        routeRule.domain = [].concat(...domainArrays.filter(item => Array.isArray(item) && item.length > 0))
        routeRule.domain = routeRule.domain.length > 0 ? routeRule.domain : undefined
        routeRule.ip = [].concat(...ipArrays.filter(item => Array.isArray(item) && item.length > 0))
        routeRule.ip = routeRule.ip.length > 0 ? routeRule.ip : undefined
        // 添加路由规则
        if (routeRule.domain) {
            let domainRule = structuredClone(routeRule)
            domainRule.ip = undefined
            routeRules.push(domainRule)
        }
        if (routeRule.ip) {
            let ipRule = structuredClone(routeRule)
            ipRule.domain = undefined
            routeRules.push(ipRule)
        }
        if (!routeRule.domain && !routeRule.ip) {
            routeRules.push(routeRule)
        }

        // 只有存在域名规则时才添加DNS规则
        if (routeRule.domain || routeRule.ip) {
            let dnsTmpl;
            let outboundTag = transOutTag(rule.dnsProxyNode)
            outboundTag = outboundTag ? outboundTag : ruleOutBoundTag
            let dnsTag = transDnsTag(rule.name)
            if (dnsInOutMap.has(outboundTag)) {
                dnsInOutMap.get(outboundTag).push(dnsTag)
            } else {
                dnsInOutMap.set(outboundTag, [dnsTag])
            }
            if (rule.dnsNode) {
                dnsTmpl = dnsServerMap.get(rule.dnsNode)
            } else {
                dnsTmpl = defaultDnsTmpl
            }
            let server = structuredClone(dnsTmpl)
            server.tag = dnsTag
            server.queryStrategy = transDnsStrategy(rule.dnsStrategy)
            server.domains = routeRule.domain
            dns.servers.push(server)
        }
    })

    let defaultDnsServer = structuredClone(defaultDnsTmpl)
    defaultDnsServer.tag = transDnsTag("default")
    defaultDnsServer.skipFallback = false
    dns.servers.push(defaultDnsServer)

    dnsInOutMap.forEach((v, k) => {
        let dnsRule = new DnsRule(v, k)
        dnsRules.push(dnsRule)
    })

    route.rules = route.rules.concat(dnsRules)
    route.rules = route.rules.concat(routeRules)

    let burstObservatory = undefined
    if (shuntSection.loadBalance) {
        let lbConf = shuntSection.loadBalance
        let balancer = new Balancer(Enum.LOAD_BALANCE_OUTBOUND_TAG)
        balancer.selector = lbConf.lbNodeList
        balancer.fallbackTag = lbConf.lbNodeList[0]
        route.balancers.push(balancer)
        burstObservatory = new BurstObservatory()
        burstObservatory.subjectSelector = lbConf.lbNodeList
    }

    let log = new Log(shuntSection.logLevel)

    let fullConfig = {}
    fullConfig['log'] = log
    fullConfig['inbounds'] = inbounds
    fullConfig['outbounds'] = outbounds
    fullConfig['dns'] = dns
    fullConfig['routing'] = route
    fullConfig['burstObservatory'] = burstObservatory

    return fullConfig
}

function transDnsTag(name) {
    return name + '-dns'
}

function transOutTag(tag) {
    if (tag === hj.ShuntTagEnum.BLOCK_OUTBOUND_TAG) {
        return Enum.BLOCK_OUTBOUND_TAG
    } else if (tag === hj.ShuntTagEnum.DIRECT_OUTBOUND_TAG) {
        return Enum.DIRECT_OUTBOUND_TAG
    } else if (tag === hj.ShuntTagEnum.LOAD_BALANCE_OUTBOUND_TAG) {
        return Enum.LOAD_BALANCE_OUTBOUND_TAG
    } else {
        return tag
    }
}

function transDnsStrategy(strategy) {
    switch (strategy) {
        case "4":
            return "UseIPv4"
        case "6":
            return "UseIPv6"
        case "64":
        case "46":
            return "UseIP"
        default:
            return undefined;
    }
}

function transRouteProtocol(protocol) {
    if (!protocol) {
        return undefined
    }
    let res = protocol.map((pro) => {
        switch (pro) {
            case "http":
            case "tls":
            case "quic":
            case "bittorrent":
                return pro
            default:
                return undefined;
        }
    }).filter(pro => pro !== undefined)
    if (res.length === 0) {
        return undefined
    }
    return res
}

function addPrefixToElements(arr, prefix) {
    if (!Array.isArray(arr)) {
        return [];
    }
    return arr.map(item => prefix + item);
}

return baseclass.extend({
    genXrayConf: genConf
});