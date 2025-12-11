import {
    BlockOutbound,
    DirectOutbound,
    DNS,
    DnsInbound, DnsRule,
    DnsServer, LocalRuleSet, Log, RemoteRuleSet,
    Route, RouteRule, RuleSet,
    Socks,
    TproxyInbound,
    URLTest
} from "../module/singbox";
import {ShuntUtils} from "./common";
import {LuciFlied, ShuntTag} from "../enum/hijpass";
import {SingBoxEnum} from "../enum/singbox";
import {RuleSetDTO, ShuntConfigUtils} from "../module/luci";
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
    let dns = new DNS(dnsConf.defaultDnsNode,
        transDnsStrategy(dnsConf.defaultStrategy),
        dnsConf.useCache === "1")

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
        let luciRuleDTO = ShuntUtils.parseRuleList(routeRule);

        if (luciRuleDTO.isEmpty("set")) {
            return;
        }

        for (let rs of luciRuleDTO.ruleSet) {
            ruleSetMap.set(rs.tag, genRuleSet(rs));
        }

        // 生成路由规则
        let action = 'route'
        let outbound = transOutTag(routeRule.proxyNode)

        if (routeRule.proxyNode === ShuntTag.BLOCK_OUTBOUND_TAG) {
            action = 'reject'
            outbound = undefined
        }
        // 添加路由规则
        route.rules.push(new RouteRule(action, outbound).initRule(luciRuleDTO))

        // 只有存在域名规则时才添加DNS规则
        if (luciRuleDTO.containDomain()
            || luciRuleDTO.containIp()
            || luciRuleDTO.containRuleSet()) {
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
                    .initRule(luciRuleDTO))
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