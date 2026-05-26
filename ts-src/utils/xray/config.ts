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
    Hysteria2Outbound,
    Inbound,
    Log,
    Outbound,
    Route,
    RouteRule,
    Socks,
    VlessOutbound,
    BlockOutbound, VlessStreamSettings,
    ShadowsocksXrayOutbound
} from "../../module/xray";
import {LuciFlied, ShuntTag} from "../../enum/hijpass";
import {Hysteria2Config, ProxyNode, ShadowsocksConfig, ShuntConfigUtils, VlessConfig} from "../../module/luci";

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

function buildBaseProxyConf(config: ProxyNode, outbound: Outbound): {} {
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
                inbound.settings = { udp: true }
                inbound.protocol = "socks"
                return inbound;
            }()
        ],
        outbounds: [outbound],
    }
}

function genProxyConf(config: ProxyNode): {} {
    switch (config.type) {
        case "vless":
            return buildBaseProxyConf(config, createVlessOutbound(config));
        case "hysteria2":
            return buildBaseProxyConf(config, createHysteria2Outbound(config as Hysteria2Config));
        case "shadowsocks":
            return buildBaseProxyConf(config, createShadowsocksXrayOutbound(config as ShadowsocksConfig));
        default:
            throw new Error("不支持的代理类型 (xray): " + config.type);
    }
}

/**
 * 创建 Shadowsocks 出站配置（Xray 核心）
 * 参考: https://xtls.github.io/config/outbounds/shadowsocks.html
 */
function createShadowsocksXrayOutbound(config: ShadowsocksConfig): ShadowsocksXrayOutbound {
    return new ShadowsocksXrayOutbound(
        config.server,
        Number(config.server_port),
        transOutTag(config.name),
        config.method,
        config.password,
        config.udp_over_tcp === '1' ? true : undefined
    );
}

/**
 * 创建 Hysteria2 出站配置
 * 参考: https://xtls.github.io/config/outbounds/hysteria.html
 * 参考: https://xtls.github.io/config/transports/hysteria.html
 */
function createHysteria2Outbound(config: Hysteria2Config): Hysteria2Outbound {
    const udpIdleTimeout = config.udp_idle_timeout ? Number(config.udp_idle_timeout) : undefined;
    return new Hysteria2Outbound(
        config.server,
        Number(config.server_port),
        transOutTag(config.name),
        config.password || '',
        config.tls_server_name || config.server,
        config.tls_insecure === '1',
        udpIdleTimeout,
    );
}

/**
 * 创建 VLESS 出站配置
 * 参考: https://xtls.github.io/config/outbounds/vless.html
 * 参考: https://xtls.github.io/config/transport.html#streamsettingsobject
 */
function createVlessOutbound(config: ProxyNode): VlessOutbound {
    const vlessConfig = config as VlessConfig;

    const outbound = new VlessOutbound(
        vlessConfig.server,
        Number(vlessConfig.server_port),
        vlessConfig.uuid,
        transOutTag(vlessConfig.name),
        'none',
        vlessConfig.flow || undefined,
        0
    );

    // ── TLS / Reality 公共配置 ────────────────────────────────────────
    const useReality = vlessConfig.tls_reality_enabled === '1';
    const realitySettings = useReality ? {
        fingerprint: 'chrome',
        serverName: vlessConfig.tls_server_name || vlessConfig.server,
        password: vlessConfig.tls_reality_public_key || '',
        shortId: vlessConfig.tls_reality_short_id || ''
    } : null;

    const tlsSettings = !useReality ? {
        allowInsecure: vlessConfig.tls_insecure === '1',
        alpn: ["h2", "http/1.1"],
        serverName: vlessConfig.tls_server_name || vlessConfig.server,
    } : null;

    const security = useReality ? 'reality' : (vlessConfig.tls_server_name || vlessConfig.tls_insecure ? 'tls' : 'none');

    const streamSettings: VlessStreamSettings = { network: 'raw', security };
    if (realitySettings) streamSettings.realitySettings = realitySettings;
    if (tlsSettings && security === 'tls') streamSettings.tlsSettings = tlsSettings;

    const transport = vlessConfig.transport_type || '';

    switch (transport) {
        case 'xhttp':
            streamSettings.network = 'xhttp';
            streamSettings.xhttpSettings = {
                host: vlessConfig.transport_xhttp_host || undefined,
                path: vlessConfig.transport_xhttp_path || '/',
                mode: vlessConfig.transport_xhttp_mode || 'auto'
            };
            break;
        case 'ws':
            streamSettings.network = 'websocket';
            streamSettings.wsSettings = {
                path: vlessConfig.transport_ws_path || '/',
                ...(vlessConfig.transport_ws_max_early_data ? {
                    headers: { 'Sec-WebSocket-Protocol': vlessConfig.transport_ws_early_data_header_name || '' }
                } : {})
            };
            break;
        case 'grpc':
            streamSettings.network = 'grpc';
            streamSettings.grpcSettings = {
                serviceName: vlessConfig.transport_grpc_service_name || 'TunService',
                ...(vlessConfig.transport_grpc_idle_timeout ? { idle_timeout: Number(vlessConfig.transport_grpc_idle_timeout) } : {}),
                ...(vlessConfig.transport_grpc_permit_without_stream === '1' ? { permit_without_stream: true } : {})
            };
            break;
        case 'http':
            streamSettings.network = 'h2';
            streamSettings.httpSettings = {
                ...(vlessConfig.transport_http_host ? { host: [vlessConfig.transport_http_host] } : {}),
                path: vlessConfig.transport_http_path || '/',
                ...(vlessConfig.transport_http_method ? { method: vlessConfig.transport_http_method } : {})
            };
            break;
        case 'httpupgrade':
            streamSettings.network = 'httpupgrade';
            streamSettings.httpupgradeSettings = {
                host: vlessConfig.transport_httpupgrade_host || undefined,
                path: vlessConfig.transport_httpupgrade_path || '/'
            };
            break;
        default:
            // 无传输层（raw/tcp），Vision 流控使用此路径
            break;
    }

    outbound['streamSettings'] = streamSettings;
    return outbound;
}


