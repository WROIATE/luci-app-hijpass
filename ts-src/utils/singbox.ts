import {
    BlockOutbound,
    DirectOutbound,
    DNS,
    DnsInbound, DnsRule,
    DnsServer, LocalRuleSet, Log, RemoteRuleSet,
    Route, RouteRule, RuleDTO, RuleSet,
    Socks,
    TproxyInbound,
    URLTest
} from "../module/singbox";
import {ShuntUtils} from "./common";
import {LuciFlied, ShuntTag} from "../enum/hijpass";
import {SingBoxEnum} from "../enum/singbox";
import {RuleSetDTO, ShuntConfigUtils, ShuntRouteRule} from "../module/luci";
import uci from "uci";

export const SingBoxUtils: ShuntConfigUtils = {
    genShuntConf: genConf
}

function genConf() {
    let shuntSection = ShuntUtils.getShuntSection()
    if (!shuntSection) {
        return
    }

    let dnsServerMap: Map<string, DnsServer> = new Map();
    let ruleSetMap: Map<string, RuleSet> = new Map();
    let dnsConf = shuntSection.dns
    let routeConf = shuntSection.route
    let route = new Route(transOutTag(routeConf.defaultProxyNode), dnsConf.defaultDnsNode)
    let dns = new DNS(dnsConf.defaultDnsNode, transDnsStrategy(dnsConf.defaultStrategy))

    dnsConf.nodes.forEach(function (dnsNode) {
        let server = new DnsServer(dnsNode.type, dnsNode.tag,
            dnsNode.server, parseInt(dnsNode.port, 10), undefined)
        dnsServerMap.set(dnsNode.tag, server)
    })

    // block出口暂未使用，预留
    let outbounds = [
        new DirectOutbound(SingBoxEnum.DIRECT_OUTBOUND_TAG),
        new BlockOutbound(SingBoxEnum.BLOCK_OUTBOUND_TAG)
    ]

    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section) {
        if (section.enabled === '1') {
            let proxyNode = new Socks("127.0.0.1", parseInt(section.socks_port, 10), section.name)
            outbounds.push(proxyNode)
        }
    })

    if (shuntSection.loadBalance) {
        let lbConf = shuntSection.loadBalance
        let testNode = new URLTest(SingBoxEnum.LOAD_BALANCE_OUTBOUND_TAG, lbConf.url,
            parseInt(lbConf.interval, 10),
            parseInt(lbConf.timeout, 10),
            undefined, undefined)

        testNode.outbounds = lbConf.lbNodeList
        outbounds.push(testNode)
    }

    let inbounds = [
        new TproxyInbound(parseInt(shuntSection.shuntListenPort, 10), SingBoxEnum.TPORXY_INBOUND_TAG),
        new DnsInbound(parseInt(shuntSection.dnsListenPort, 10), SingBoxEnum.DNS_INBOUND_TAG)
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

        if (routeRule.proxyNode === ShuntTag.BLOCK_OUTBOUND_TAG) {
            action = 'reject'
            outbound = undefined
        }
        // 添加路由规则
        route.rules.push(new RouteRule(action, outbound).initRule(rule))

        // 检查规则中是否存在域名相关规则
        let hasDomainRule = rule.domain || rule.domain_suffix ||
            rule.domain_keyword || rule.domain_regex ||
            (rule.rule_set && rule.rule_set.length > 0);

        // 只有存在域名规则时才添加DNS规则
        if (hasDomainRule || rule.ip_cidr) {
            let dnsTag = routeRule.dnsNode
            let detour = transOutTag(routeRule.dnsProxyNode)
            detour = detour ? detour : outbound

            let dnsTmpl: DnsServer
            if (dnsTag) {
                dnsTmpl = dnsServerMap.get(dnsTag);
            } else {
                dnsTmpl = dnsServerMap.get(route.default_domain_resolver)
            }
            let server = genDnsFromTmpl(transDnsTag(routeRule.name), detour, dnsTmpl)
            dns.servers.push(server)
            dns.rules.push(
                new DnsRule(action, transDnsTag(routeRule.name), transDnsStrategy(routeRule.dnsStrategy))
                    .initRule(rule))
        }
    })

    ruleSetMap.forEach((value) => {
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

function genRule(routeRule: ShuntRouteRule, ruleSetMap: Map<string, RuleSet>) {
    let rule = new RuleDTO()
    rule.network = routeRule.network
    rule.protocol = routeRule.protocol
    if (routeRule.port) {
        rule.port = routeRule.port
            .map(port => parseInt(port, 10))
            .filter(port => !isNaN(port))
    }
    if (routeRule.portRange) {
        rule.port_range = routeRule.portRange
            .map(range => range.replace('-', ':'))
            .filter(range => range.length > 0)
    }

    let domainMap = ShuntUtils.parseRuleList(routeRule.domainList, 'domain');
    if (domainMap) {
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
    }

    let ipMap = ShuntUtils.parseRuleList(routeRule.ipList, 'ip');
    if (ipMap) {
        rule.ip_cidr = ipMap.ipCidr
        if (ipMap.ruleSet) {
            rule.rule_set = rule.rule_set ? rule.rule_set : []
            for (let rs of ipMap.ruleSet) {
                rule.rule_set.push(rs.tag)
                ruleSetMap.set(rs.tag, genRuleSet(rs));
            }
        }
    }

    return rule;
}


function genDnsFromTmpl(tag: string, detour: string, tmpl: DnsServer) {
    return new DnsServer(tmpl.type, tag, tmpl.server, tmpl.port, detour);
}

function genRuleSet(rs: RuleSetDTO) {
    if (rs.type === 'remote') {
        return new RemoteRuleSet(rs.tag, rs.format, rs.pathOrUrl, undefined, undefined)
    } else if (rs.type === 'local') {
        return new LocalRuleSet(rs.tag, rs.format, rs.pathOrUrl)
    }
}


function transDnsStrategy(strategy: string) {
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

function transOutTag(tag: string) {
    if (tag === ShuntTag.BLOCK_OUTBOUND_TAG) {
        return SingBoxEnum.BLOCK_OUTBOUND_TAG
    } else if (tag === ShuntTag.DIRECT_OUTBOUND_TAG) {
        return SingBoxEnum.DIRECT_OUTBOUND_TAG
    } else if (tag === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG) {
        return SingBoxEnum.LOAD_BALANCE_OUTBOUND_TAG
    } else {
        return tag
    }
}

function transDnsTag(name: string) {
    return name + '-dns'
}