import './protocols/registry'
import uci from 'uci'
import {XrayEnum} from '../../enum/xray'
import {ShuntUtils} from '../../utils/common'
import {
    Balancer, BurstObservatory,
    DNS, DnsOutbound, DnsRule, DnsServer,
    Freedom, Inbound, Log, Outbound, Route,
    RouteRule, Socks, BlockOutbound
} from './models'
import {LuciFlied, ShuntTag} from '../../enum/hijpass'
import { CoreAdapter, ProxyNode } from '../../module/luci'
import {xrayRegistry} from './protocols/protocol'

export const XrayUtils: CoreAdapter = {
    genShuntConf: genConf,
    genProxyConf
}

function genConf() {
    const shuntSection = ShuntUtils.getShuntSection()

    const dnsServerMap = new Map<string, DnsServer>()
    const route = new Route<RouteRule | DnsRule>()

    const dnsConf = shuntSection.dns
    const dns = new DNS(transDnsStrategy(dnsConf.defaultStrategy), dnsConf.useCache === '1')
    dnsConf.nodes.forEach(function (dnsNode) {
        const server = new DnsServer(dnsNode.type, dnsNode.tag, dnsNode.server, Number(dnsNode.port))
        dnsServerMap.set(dnsNode.tag, server)
    })

    const routeConf = shuntSection.route
    const outbounds: Outbound[] = []
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section) {
        if (section.enabled === '1') {
            const proxyNode = new Socks('127.0.0.1', Number(section.socks_port), transOutTag(section.name))
            if (section.name === routeConf.defaultProxyNode) {
                outbounds.unshift(proxyNode)
            } else {
                outbounds.push(proxyNode)
            }
        }
    })
    if (routeConf.defaultProxyNode === ShuntTag.DIRECT_OUTBOUND_TAG) {
        outbounds.unshift(new Freedom(XrayEnum.DIRECT_OUTBOUND_TAG))
    } else {
        outbounds.push(new Freedom(XrayEnum.DIRECT_OUTBOUND_TAG))
    }
    outbounds.push(new BlockOutbound(XrayEnum.BLOCK_OUTBOUND_TAG))
    outbounds.push(new DnsOutbound(XrayEnum.DNS_OUTBOUND_TAG))

    const inbounds = [
        new Inbound('tproxy', parseInt(shuntSection.shuntListenPort, 10), XrayEnum.TPROXY_INBOUND_TAG),
        new Inbound('direct', parseInt(shuntSection.dnsListenPort, 10), XrayEnum.DNS_INBOUND_TAG)
    ]

    const dnsRules = [new DnsRule([XrayEnum.DNS_INBOUND_TAG], XrayEnum.DNS_OUTBOUND_TAG)]
    const routeRules: RouteRule[] = []
    const defaultDnsTmpl = dnsServerMap.get(dnsConf.defaultDnsNode)
    const dnsInOutMap = new Map<string, string[]>()

    routeConf.rules.forEach(function (rule) {
        if (rule.enabled !== '1') return

        const ruleOutBoundTag = transOutTag(rule.proxyNode) || outbounds[0].tag
        const routeRule = new RouteRule(rule.name, ruleOutBoundTag)

        const luciRuleDTO = ShuntUtils.parseRuleList(rule)
        if (luciRuleDTO.isEmpty('geo')) throw new Error('Empty rule: ' + rule.name)

        routeRule.network = luciRuleDTO.network
        routeRule.protocol = transRouteProtocol(luciRuleDTO.protocol)
        let allPorts: string[] = luciRuleDTO.port.map(p => String(p))
        if (luciRuleDTO.portRange && luciRuleDTO.portRange.length > 0) {
            allPorts = allPorts.concat(luciRuleDTO.portRange)
        }
        routeRule.port = allPorts.join(',')

        const domainArrays = [
            addPrefixToElements(luciRuleDTO.domain, 'full:'),
            addPrefixToElements(luciRuleDTO.domainSuffix, 'domain:'),
            luciRuleDTO.domainKeyword,
            addPrefixToElements(luciRuleDTO.domainRegex, 'regexp:'),
            luciRuleDTO.geoSite
        ]
        const ipArrays = [luciRuleDTO.ipCidr, luciRuleDTO.geoIp]
        routeRule.domain = ([] as string[]).concat(...domainArrays.filter(a => Array.isArray(a) && a.length > 0))
        routeRule.domain = routeRule.domain.length > 0 ? routeRule.domain : undefined
        routeRule.ip = ([] as string[]).concat(...ipArrays.filter(a => Array.isArray(a) && a.length > 0))
        routeRule.ip = routeRule.ip.length > 0 ? routeRule.ip : undefined

        if (routeRule.domain) {
            const domainRule = structuredClone(routeRule)
            domainRule.ip = undefined
            routeRules.push(domainRule)
        }
        if (routeRule.ip) {
            const ipRule = structuredClone(routeRule)
            ipRule.domain = undefined
            routeRules.push(ipRule)
        }
        if (!routeRule.domain && !routeRule.ip) routeRules.push(routeRule)

        if (routeRule.outboundTag === XrayEnum.BLOCK_OUTBOUND_TAG) return

        if (luciRuleDTO.containDomain() || luciRuleDTO.containGeo()) {
            const outboundTag = transOutTag(rule.dnsProxyNode) || ruleOutBoundTag
            const dnsTag = transDnsTag(rule.name)
            if (dnsInOutMap.has(outboundTag)) {
                dnsInOutMap.get(outboundTag).push(dnsTag)
            } else {
                dnsInOutMap.set(outboundTag, [dnsTag])
            }
            const dnsTmpl = rule.dnsNode ? dnsServerMap.get(rule.dnsNode) : defaultDnsTmpl
            const server = structuredClone(dnsTmpl)
            server.tag = dnsTag
            server.queryStrategy = transDnsStrategy(rule.dnsStrategy)
            server.domains = routeRule.domain
            dns.servers.push(server)
        }
    })

    const defaultDnsServer = structuredClone(defaultDnsTmpl)
    defaultDnsServer.tag = transDnsTag('default')
    defaultDnsServer.skipFallback = false
    dns.servers.push(defaultDnsServer)

    dnsInOutMap.forEach((v, k) => dns.rules.push(new DnsRule(v, k)))

    route.rules = route.rules.concat(dnsRules)
    route.rules = route.rules.concat(routeRules)

    let burstObservatory = undefined
    if (shuntSection.loadBalance.lbNodeList.length > 0) {
        const lbConf = shuntSection.loadBalance
        const balancer = new Balancer(XrayEnum.LOAD_BALANCE_OUTBOUND_TAG)
        balancer.selector = lbConf.lbNodeList
        balancer.fallbackTag = lbConf.fallbackTag || lbConf.lbNodeList[0]
        const strategy = lbConf.strategy || 'leastLoad'
        balancer.strategy.type = strategy
        if (strategy === 'leastLoad') {
            if (lbConf.strategyExpected) balancer.strategy.settings.expected = parseInt(lbConf.strategyExpected, 10)
            if (lbConf.strategyMaxRtt) balancer.strategy.settings.maxRTT = lbConf.strategyMaxRtt
            if (lbConf.strategyTolerance) balancer.strategy.settings.tolerance = parseFloat(lbConf.strategyTolerance)
        }
        route.balancers.push(balancer)
        burstObservatory = new BurstObservatory(
            lbConf.probeUrl || undefined,
            lbConf.probeConnectivity || undefined,
            lbConf.probeInterval || undefined,
            lbConf.probeTimeout || undefined,
            lbConf.probeSampling ? parseInt(lbConf.probeSampling, 10) : undefined,
            lbConf.probeHttpMethod || undefined
        )
        burstObservatory.subjectSelector = lbConf.lbNodeList
    }

    const log = new Log(shuntSection.logLevel)

    return {
        log,
        inbounds,
        outbounds,
        dns,
        routing: route,
        burstObservatory
    }
}

function genProxyConf(config: ProxyNode): {} {
    const outbound = xrayRegistry.build(config.type, config)
    return buildBaseProxyConf(config, outbound)
}

function buildBaseProxyConf(config: ProxyNode, outbound: Outbound): {} {
    const tproxyInbound = new Inbound('tproxy', Number(config.listen_port), 'tproxy-in')
    tproxyInbound.sniffing = undefined

    const socksInbound = new Inbound('direct', Number(config.socks_port), 'socks-in')
    socksInbound.settings = {udp: true}
    socksInbound.protocol = 'socks'

    return {
        log: {loglevel: 'info', dnsLog: false},
        inbounds: [tproxyInbound, socksInbound],
        outbounds: [outbound]
    }
}

function transDnsTag(name: string) {
    return name + '-dns'
}

function transOutTag(tag: string) {
    if (tag === ShuntTag.BLOCK_OUTBOUND_TAG) return XrayEnum.BLOCK_OUTBOUND_TAG
    if (tag === ShuntTag.DIRECT_OUTBOUND_TAG) return XrayEnum.DIRECT_OUTBOUND_TAG
    if (tag === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG) return XrayEnum.LOAD_BALANCE_OUTBOUND_TAG
    return tag
}

function transDnsStrategy(strategy: string) {
    switch (strategy) {
        case '4':
            return 'UseIPv4'
        case '6':
            return 'UseIPv6'
        case '64':
        case '46':
            return 'UseIP'
        default:
            return undefined
    }
}

function transRouteProtocol(protocol: string[]) {
    if (!protocol) return undefined
    const res = protocol.map((pro: string) => {
        switch (pro) {
            case 'http':
            case 'tls':
            case 'quic':
            case 'bittorrent':
                return pro
            default:
                throw new Error('Unsupported xray rule protocol: ' + pro)
        }
    }).filter(p => p !== undefined)
    return res.length === 0 ? undefined : res
}

function addPrefixToElements(arr: string[], prefix: string) {
    if (!Array.isArray(arr)) return []
    return arr.map(item => prefix + item)
}
