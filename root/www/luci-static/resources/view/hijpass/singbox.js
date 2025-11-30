'use strict';
'require uci';
'require network'
'require baseclass';
'require form';
'require ui';
'require view.hijpass.hijpass as hj';

const Enum = {
    DIRECT_OUTBOUND_TAG: "direct-out",
    BLOCK_OUTBOUND_TAG: "block",
    TPORXY_INBOUND_TAG: "tproxy-in",
    DNS_INBOUND_TAG: "dns-in",
    LOAD_BALANCE_OUTBOUND_TAG: "slb",
    DEFAULT_LOG_LEVEL: "info",
    DEFAULT_DNS_STRATEGY: "prefer_ipv6"
}

class Log {
    constructor(logLevel) {
        this.disabled = false
        this.level = logLevel || Enum.DEFAULT_LOG_LEVEL
        this.timestamp = true
    }
}

// DNS Server Template
class DnsServer {
    constructor(type, tag, server, port, detour) {
        this.type = type
        this.tag = tag
        this.server = server
        this.port = port
        if (detour === Enum.DIRECT_OUTBOUND_TAG) {
            this.detour = undefined
        } else {
            this.detour = detour
        }
    }
}

// DNS Global Template
class DNS {
    constructor(dnsConf) {
        this.servers = []
        this.rules = []
        this.strategy = transDnsStrategy(dnsConf.defaultStrategy) || Enum.DEFAULT_DNS_STRATEGY
        this.disable_cache = true
        this.disable_expire = true
        this.final = dnsConf.defaultDnsNode
    }
}

// RuleDTO Template
class Rule {
    constructor() {
        this.protocol = undefined
        this.port = undefined
        this.port_range = undefined
        this.domain = undefined
        this.domain_suffix = undefined
        this.domain_keyword = undefined
        this.domain_regex = undefined
        this.rule_set = undefined
        this.ip_cidr = undefined
    }
}

class RouteRule extends Rule {
    constructor(rule, action, outbound) {
        super();
        if (rule) {
            this.network = rule.network;
            this.protocol = rule.protocol;
            this.port = rule.port;
            this.port_range = rule.port_range;
            this.domain = rule.domain;
            this.domain_suffix = rule.domain_suffix;
            this.domain_keyword = rule.domain_keyword;
            this.domain_regex = rule.domain_regex;
            this.rule_set = rule.rule_set;
            this.ip_cidr = rule.ip_cidr;
        }
        this.action = action
        this.outbound = outbound
    }
}

class DnsRule extends Rule {
    constructor(rule, action, server, strategy) {
        super();
        if (rule) {
            this.domain = rule.domain;
            this.domain_suffix = rule.domain_suffix;
            this.domain_keyword = rule.domain_keyword;
            this.domain_regex = rule.domain_regex;
            this.rule_set = rule.rule_set;
        }
        this.action = action
        this.server = server
        this.strategy = strategy
        this.disable_cache = true
    }
}

// RuleDTO Set Template
class RuleSet {
    constructor(tag, type, format) {
        this.type = type
        this.tag = tag;
        this.format = format
    }
}

// RuleDTO Set Template
class RemoteRuleSet extends RuleSet {
    constructor(tag, format, url, download_detour, update_interval) {
        super(tag, 'remote', format);
        this.url = url;
        this.download_detour = download_detour;
        this.update_interval = update_interval;
    }
}

// Local RuleDTO Set Template
class LocalRuleSet extends RuleSet {
    constructor(tag, format, path) {
        super(tag, 'local', format);
        this.path = path;
    }
}

// Route Global Template
class Route {
    constructor(routeConf, dnsConf) {
        this.rules = [
            {
                action: 'sniff'
            },
            {
                protocol: 'dns',
                action: 'hijack-dns'
            }
        ]
        this.rule_set = []
        this.default_domain_resolver = dnsConf.defaultDnsNode
        this.final = transOutTag(routeConf.defaultProxyNode)
    }
}

class Outbound {
    constructor(type, tag) {
        this.type = type
        this.tag = tag
    }
}

class BlockOutbound extends Outbound {
    constructor(tag) {
        super('block', tag);
    }
}

class DirectOutbound extends Outbound {
    constructor(tag) {
        super('direct', tag);
    }
}

class Socks extends Outbound {
    constructor(server, server_port, tag) {
        super('socks', tag);
        this.server = server
        this.server_port = server_port
        this.version = '5'
    }
}

class URLTest extends Outbound {
    constructor(tag, url, interval, tolerance, idle_timeout, interrupt_exist_connections) {
        super('urltest', tag)
        this.outbounds = []
        this.url = url
        this.interval = interval
        this.tolerance = tolerance
        this.idle_timeout = idle_timeout
        this.interrupt_exist_connections = interrupt_exist_connections
    }
}

class Inbound {
    constructor(type, port, tag) {
        this.type = type
        this.tag = tag
        this.listen = "::"
        this.listen_port = port
    }
}

class TproxyInbound extends Inbound {
    constructor(port, tag) {
        super("tproxy", port, tag)
    }
}

class DnsInbound extends Inbound {
    constructor(port, tag) {
        super("direct", port, tag)
    }
}

function genConf() {
    let shuntSection = hj.ShuntUtils.getShuntSection()
    if (!shuntSection) {
        return
    }

    let dnsServerMap = new Map();
    let ruleSetMap = new Map();
    let dnsConf = shuntSection.dns
    let routeConf = shuntSection.route
    let route = new Route(routeConf, dnsConf)
    let dns = new DNS(dnsConf)

    dnsConf.nodes.forEach(function (dnsNode) {
        let server = new DnsServer(dnsNode.type, dnsNode.tag, dnsNode.server, dnsNode.port, undefined)
        dnsServerMap.set(dnsNode.tag, server)
    })

    // block出口暂未使用，预留
    let outbounds = [
        new DirectOutbound(Enum.DIRECT_OUTBOUND_TAG),
        new BlockOutbound(Enum.BLOCK_OUTBOUND_TAG)
    ]

    uci.sections(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.PROXY_NODE_TYPE, function (section) {
        if (section.enabled === '1') {
            let proxyNode = new Socks("127.0.0.1", parseInt(section.socks_port, 10), section.name)
            outbounds.push(proxyNode)
        }
    })

    if (shuntSection.loadBalance) {
        let lbConf = shuntSection.loadBalance
        let testNode = new URLTest(Enum.LOAD_BALANCE_OUTBOUND_TAG, lbConf.url, lbConf.interval,
            lbConf.timeout, undefined, undefined)

        testNode.outbounds = lbConf.lbNodeList
        outbounds.push(testNode)
    }

    let inbounds = [
        new TproxyInbound(parseInt(shuntSection.shuntListenPort, 10), Enum.TPORXY_INBOUND_TAG),
        new DnsInbound(parseInt(shuntSection.dnsListenPort, 10), Enum.DNS_INBOUND_TAG)
    ]


    if (route.default_domain_resolver && route.final) {
        let dnsTmpl = dnsServerMap.get(route.default_domain_resolver)
        let server = genDnsFromTmpl(dnsTmpl.tag, route.final, dnsTmpl)
        dns.servers.push(server)
    }

    routeConf.rules.forEach(function (routeRule) {
        if (routeRule.enabled !== "1") {
            return
        }
        // 生成公共rule
        let rule = genRule(routeRule, ruleSetMap)

        // 生成路由规则
        let action = 'route'
        let outbound = transOutTag(routeRule.proxyNode)

        if (routeRule.proxyNode === hj.ShuntTagEnum.BLOCK_OUTBOUND_TAG) {
            action = 'reject'
            outbound = undefined
        }

        // 添加路由规则
        route.rules.push(new RouteRule(rule, action, outbound))

        // 检查规则中是否存在域名相关规则
        let hasDomainRule = rule.domain || rule.domain_suffix ||
            rule.domain_keyword || rule.domain_regex ||
            (rule.rule_set && rule.rule_set.length > 0);

        // 只有存在域名规则时才添加DNS规则
        if (hasDomainRule || rule.ip_cidr) {
            let dnsTag = routeRule.dnsNode
            let detour = transOutTag(routeRule.dnsProxyNode)
            detour = detour ? detour : outbound

            let dnsTmpl
            if (dnsTag) {
                dnsTmpl = dnsServerMap.get(dnsTag);
            } else {
                dnsTmpl = dnsServerMap.get(route.default_domain_resolver)
            }
            let server = genDnsFromTmpl(transDnsTag(routeRule.name), detour, dnsTmpl)
            dns.servers.push(server)
            dns.rules.push(new DnsRule(rule, action, transDnsTag(routeRule.name),
                transDnsStrategy(routeRule.dnsStrategy)))
        }
    })

    ruleSetMap.forEach((value, key) => {
        route.rule_set.push(value)
    });

    let log = new Log(shuntSection.logLevel)

    let fullConfig = {}
    fullConfig['log'] = log
    fullConfig['inbounds'] = inbounds
    fullConfig['outbounds'] = outbounds
    fullConfig['dns'] = dns
    fullConfig['route'] = route

    return fullConfig
}

function genRule(routeRule, ruleSetMap) {
    let rule = new Rule()
    rule.network = routeRule.network
    rule.protocol = routeRule.protocol
    if (routeRule.port) {
        rule.port = routeRule.port.map(port => parseInt(port, 10))
    }
    if (routeRule.portRange) {
        rule.port_range = routeRule.portRange.map(range => range.replace('-', ':'))
    }

    let domainMap = hj.ShuntUtils.parseRuleList(routeRule.domainList, 'domain');
    rule.domain = domainMap.domain
    rule.domain_suffix = domainMap.domainSuffix
    rule.domain_keyword = domainMap.domainKeyword
    rule.domain_regex = domainMap.domainRegex
    if (domainMap.ruleSet) {
        rule.rule_set = rule.rule_set ? rule.rule_set : []
        for (let rs of domainMap.ruleSet) {
            rule.rule_set.push(rs.tag)
            ruleSetMap.set(rs.tag, genRuleSet(rs));
        }
    }

    let ipMap = hj.ShuntUtils.parseRuleList(routeRule.ipList, 'ip');
    rule.ip_cidr = ipMap.ipCidr
    if (ipMap.ruleSet) {
        rule.rule_set = rule.rule_set ? rule.rule_set : []
        for (let rs of ipMap.ruleSet) {
            rule.rule_set.push(rs.tag)
            ruleSetMap.set(rs.tag, genRuleSet(rs));
        }
    }

    return rule;
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

function transDnsTag(name) {
    return name + '-dns'
}

function genDnsFromTmpl(tag, detour, tmpl) {
    return new DnsServer(tmpl.type, tag, tmpl.server, tmpl.port, detour);
}

function genRuleSet(rs) {
    if (rs.type === 'remote') {
        return new RemoteRuleSet(rs.tag, rs.format, rs.pathOrUrl)
    } else if (rs.type === 'local') {
        return new LocalRuleSet(rs.tag, rs.format, rs.pathOrUrl)
    }
}

function transDnsStrategy(strategy) {
    switch (strategy) {
        case "4":
            return "ipv4_only"
        case "6":
            return "ipv6_only"
        case "64":
            return "prefer_ipv6"
        case "46":
            return "prefer_ipv4"
        default:
            return undefined;
    }
}

function main() {
    return baseclass.extend({
        genConf: genConf
    });
}