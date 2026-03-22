import uci from 'uci'

import {XrayEnum} from "../../enum/xray";
import {ShuntUtils} from "../common";
import {
    Balancer, BurstObservatory,
    DNS,
    DnsOutbound,
    DnsRule,
    DnsServer,
    Freedom,
    Inbound,
    Log,
    Outbound,
    Route,
    RouteRule,
    Socks,
    VlessOutbound,
    BlockOutbound, VlessStreamSettings
} from "../../module/xray";
import {LuciFlied, ShuntTag} from "../../enum/hijpass";
import {ProxyNode, ShuntConfigUtils, VlessConfig} from "../../module/luci";

export const XrayUtils: ShuntConfigUtils = {
    genShuntConf: genConf,
    genProxyConf: genProxyConf
}

function genConf() {
    let shuntSection = ShuntUtils.getShuntSection()

    let dnsServerMap: Map<string, DnsServer> = new Map();
    let route = new Route()

    let dnsConf = shuntSection.dns
    let dns = new DNS(transDnsStrategy(dnsConf.defaultStrategy), dnsConf.useCache === "1")
    dnsConf.nodes.forEach(function (dnsNode) {
        let server = new DnsServer(dnsNode.type, dnsNode.tag, dnsNode.server, Number(dnsNode.port))
        dnsServerMap.set(dnsNode.tag, server)
    })

    let routeConf = shuntSection.route
    let outbounds: Outbound[] = []
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section) {
        if (section.enabled === '1') {
            let proxyNode = new Socks("127.0.0.1",
                Number(section.socks_port), transOutTag(section.name))
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

    let inbounds = [
        new Inbound("tproxy", parseInt(shuntSection.shuntListenPort, 10), XrayEnum.TPROXY_INBOUND_TAG),
        new Inbound("direct", parseInt(shuntSection.dnsListenPort, 10), XrayEnum.DNS_INBOUND_TAG)
    ]

    let dnsRules = [new DnsRule([XrayEnum.DNS_INBOUND_TAG], XrayEnum.DNS_OUTBOUND_TAG)]

    let routeRules = []
    let defaultDnsTmpl = dnsServerMap.get(dnsConf.defaultDnsNode)
    let dnsInOutMap: Map<string, string[]> = new Map()

    routeConf.rules.forEach(function (rule) {
        if (rule.enabled !== "1") {
            return
        }
        // 生成路由规则
        let ruleOutBoundTag = transOutTag(rule.proxyNode)
        ruleOutBoundTag = ruleOutBoundTag ? ruleOutBoundTag : outbounds[0].tag
        let routeRule = new RouteRule(rule.name, ruleOutBoundTag)

        let luciRuleDTO = ShuntUtils.parseRuleList(rule);
        if (luciRuleDTO.isEmpty("geo")) {
            throw new Error("Empty rule: " + rule.name)
        }

        routeRule.network = luciRuleDTO.network
        routeRule.protocol = transRouteProtocol(luciRuleDTO.protocol)
        let allPorts: string[] = luciRuleDTO.port.map(p => String(p))
        if (luciRuleDTO.portRange && luciRuleDTO.portRange.length > 0) {
            allPorts = allPorts.concat(luciRuleDTO.portRange)
        }
        routeRule.port = allPorts.join(',')

        const domainArrays: string[][] = [
            addPrefixToElements(luciRuleDTO.domain, 'full:'),
            addPrefixToElements(luciRuleDTO.domainSuffix, 'domain:'),
            luciRuleDTO.domainKeyword,
            addPrefixToElements(luciRuleDTO.domainRegex, 'regexp:'),
            luciRuleDTO.geoSite
        ];
        const ipArrays = [
            luciRuleDTO.ipCidr,
            luciRuleDTO.geoIp
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

        if (routeRule.outboundTag === XrayEnum.BLOCK_OUTBOUND_TAG) {
            return;
        }

        // 只有存在域名规则时才添加DNS规则
        if (luciRuleDTO.containDomain()
            || luciRuleDTO.containGeo()) {
            let dnsTmpl: DnsServer;
            let outboundTag = transOutTag(rule.dnsProxyNode);
            outboundTag = outboundTag ? outboundTag : ruleOutBoundTag;
            let dnsTag = transDnsTag(rule.name);
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
            let server = structuredClone(dnsTmpl);
            server.tag = dnsTag;
            server.queryStrategy = transDnsStrategy(rule.dnsStrategy);
            server.domains = routeRule.domain;
            dns.servers.push(server);
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
    if (shuntSection.loadBalance.lbNodeList.length > 0) {
        let lbConf = shuntSection.loadBalance
        let balancer = new Balancer(XrayEnum.LOAD_BALANCE_OUTBOUND_TAG)
        balancer.selector = lbConf.lbNodeList
        balancer.fallbackTag = lbConf.lbNodeList[0]
        route.balancers.push(balancer)
        burstObservatory = new BurstObservatory(undefined, undefined, undefined, undefined)
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

function transDnsTag(name: string) {
    return name + '-dns'
}

function transOutTag(tag: string) {
    if (tag === ShuntTag.BLOCK_OUTBOUND_TAG) {
        return XrayEnum.BLOCK_OUTBOUND_TAG
    } else if (tag === ShuntTag.DIRECT_OUTBOUND_TAG) {
        return XrayEnum.DIRECT_OUTBOUND_TAG
    } else if (tag === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG) {
        return XrayEnum.LOAD_BALANCE_OUTBOUND_TAG
    } else {
        return tag
    }
}

function transDnsStrategy(strategy: string) {
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

function transRouteProtocol(protocol: string[]) {
    if (!protocol) {
        return undefined
    }
    let res = protocol.map((pro: string) => {
        switch (pro) {
            case "http":
            case "tls":
            case "quic":
            case "bittorrent":
                return pro
            default:
                throw new Error("Unsupported xray rule protocol: " + pro)
        }
    }).filter(pro => pro !== undefined)
    if (res.length === 0) {
        return undefined
    }
    return res
}

function addPrefixToElements(arr: string[], prefix: string) {
    if (!Array.isArray(arr)) {
        return [];
    }
    return arr.map(item => prefix + item);
}

function genProxyConf(config: ProxyNode): {} {
    switch (config.type) {
        case "vless":
            return {
                log: {
                    loglevel: "info",
                    dnsLog: false
                },
                inbounds: [
                    function () {
                        let inbound = new Inbound("tproxy", Number(config.listen_port), "tproxy-in")
                        inbound.sniffing = undefined;
                        return inbound;
                    }(),
                    function () {
                        let inbound = new Inbound("socks", Number(config.socks_port), "socks-in");
                        inbound.settings = {
                            udp: true
                        }
                        inbound.protocol = "socks"
                        return inbound;
                    }()
                ],
                outbounds: [createVlessOutbound(config)],
            }
        default:
            throw new Error("不支持的代理类型: " + config.type);
    }
}

/**
 * 创建 VLESS 出站配置
 * 参考: https://xtls.github.io/config/outbounds/vless.html
 * 参考: https://xtls.github.io/config/transport.html#streamsettingsobject
 */
function createVlessOutbound(config: ProxyNode): VlessOutbound {

    // 从 section 创建 VLESS 出站
    const vlessConfig = config as VlessConfig;
    if (vlessConfig.transport_type !== "xhttp") {
        throw new Error("transport type must be a xhttp object")
    }
    const outbound = new VlessOutbound(
        vlessConfig.server,
        Number(vlessConfig.server_port),
        vlessConfig.uuid,
        transOutTag(vlessConfig.name),
        'none', // 加密方式，xray 中默认使用 none
        vlessConfig.flow || undefined, // XTLS 流控模式
        0 // 用户等级
    );

    // 设置 streamSettings（流传输层配置）
    const streamSettings: VlessStreamSettings = {
        network: 'xhttp',
        security: "none"
    };

    streamSettings.xhttpSettings = {
        host: vlessConfig.transport_xhttp_host || "",
        path: vlessConfig.transport_xhttp_path || '/',
        mode: vlessConfig.transport_xhttp_mode || 'auto'
    };

    // Reality 配置
    if (vlessConfig.tls_reality_enabled === '1') {
        streamSettings.security = "reality"
        streamSettings.realitySettings = {
            fingerprint: 'chrome',
            serverName: vlessConfig.tls_server_name || vlessConfig.server,
            password: vlessConfig.tls_reality_public_key || '',
            shortId: vlessConfig.tls_reality_short_id || ''
        };
    } else {
        streamSettings.security = "tls"
        streamSettings.tlsSettings = {
            allowInsecure: false,
            alpn: ["h2", "http/1.1"],
            serverName: vlessConfig.tls_server_name || vlessConfig.server,
        }
    }


    // 设置 streamSettings 到 outbound
    if (Object.keys(streamSettings).length > 0) {
        outbound['streamSettings'] = streamSettings;
    }

    return outbound;
}


