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
import {RuleDTO, RuleSetDTO} from "../module/luci";
import uci from "uci";

export const SingBoxUtils = {
    genShuntConf: genConf,
    writeGeoRule: writeGeoRule
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
    let outbounds: any[] = []
    outbounds = [
        new DirectOutbound(SingBoxEnum.DIRECT_OUTBOUND_TAG),
        new BlockOutbound(SingBoxEnum.BLOCK_OUTBOUND_TAG)
    ]

    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section) {
        if (section.enabled === '1') {
            let proxyNode = new Socks("127.0.0.1", Number(section.socks_port), section.name)
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

    if (routeConf.rulesetOutNode) {
        let outTag = transOutTag(routeConf.rulesetOutNode)
        let node = outbounds.find(function (outbound) {
            return outbound.tag === outTag
        })
        if (node) {
            let rulesetOutNode = structuredClone(node)
            rulesetOutNode.tag = SingBoxEnum.RULESET_OUTBOUND_TAG
            if (dnsConf.rulesetDnsNode) {
                rulesetOutNode.domain_resolver = SingBoxEnum.RULESET_DNS_NAME;
                let dnsTmpl = dnsServerMap.get(dnsConf.rulesetDnsNode)
                let server = genDnsFromTmpl(SingBoxEnum.RULESET_DNS_NAME, SingBoxEnum.RULESET_OUTBOUND_TAG, dnsTmpl)
                dns.servers.push(server)
            }
            outbounds.push(rulesetOutNode)
        }
    }

    routeConf.rules.forEach(function (routeRule) {
        if (routeRule.enabled !== "1") {
            return
        }
        // 生成公共rule
        let luciRuleDTO = ShuntUtils.parseRuleList(routeRule);

        if (routeConf.rulesetConvert === '1') {
            convertGeoRule(luciRuleDTO)
        }

        if (luciRuleDTO.isEmpty("set")) {
            throw new Error("Empty rule: " + routeRule.name);
        }

        for (let rs of luciRuleDTO.ruleSet) {
            ruleSetMap.set(rs.tag, genRuleSet(rs, routeConf.rulesetOutNode ? SingBoxEnum.RULESET_OUTBOUND_TAG : undefined));
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

        if (action === 'reject') {
            return;
        }

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

function genRuleSet(rs: RuleSetDTO, detour: string) {
    if (rs.type === 'remote') {
        return new RemoteRuleSet(rs.tag, rs.format, rs.pathOrUrl, detour, undefined)
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

function convertGeoRule(luciRuleDTO: RuleDTO) {
    luciRuleDTO.ruleSet = []
    for (let geo of luciRuleDTO.geoSite) {
        let tag = geo.replace('geosite:', 'geosite-')
        luciRuleDTO.ruleSet.push({
            tag: tag,
            type: 'local',
            format: 'binary',
            pathOrUrl: '/etc/hijpass/ruleset/' + tag + '.srs'
        })
    }
    for (let geo of luciRuleDTO.geoIp) {
        let tag = geo.replace('geoip:', 'geoip-')
        luciRuleDTO.ruleSet.push({
            tag: tag,
            type: 'local',
            format: 'binary',
            pathOrUrl: '/etc/hijpass/ruleset/' + tag + '.srs'
        })
    }
}

function writeGeoRule() {
    let routeConf = ShuntUtils.getRouteSection()
    let geoSiteSet = new Set()
    let geoIpSet = new Set()
    for (let rule of routeConf.rules) {
        let luciRuleDTO = ShuntUtils.parseRuleList(rule);
        for (let geo of luciRuleDTO.geoSite) {
            geoSiteSet.add(geo.replace('geosite:', ''))
        }
        for (let geo of luciRuleDTO.geoIp) {
            geoIpSet.add(geo.replace('geoip:', ''))
        }
    }
    let geoSiteList = [...geoSiteSet];
    let geoIpList = [...geoIpSet];
    if (geoIpList.length > 0) {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geoip_ruleset', geoIpList)
    } else {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geoip_ruleset', undefined)
    }
    if (geoSiteList.length > 0) {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geosite_ruleset', geoSiteList)
    } else {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geosite_ruleset', undefined)
    }
}