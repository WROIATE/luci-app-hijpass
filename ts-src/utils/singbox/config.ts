import {
    BlockOutbound,
    BrutalConfig,
    DirectOutbound,
    DNS,
    DnsInbound,
    DnsRule,
    DnsServer, GrpcTransport,
    HttpTransport, HttpUpgradeTransport,
    Hysteria2Outbound,
    LocalRuleSet,
    Log,
    MultiplexConfig,
    ObfsConfig,
    Outbound,
    RemoteRuleSet,
    Route,
    RouteRule,
    RuleSet,
    ShadowsocksOutbound,
    ShadowTLSOutbound, SocksInbound,
    SocksOutbound,
    TproxyInbound,
    TransportConfig,
    TuicOutbound,
    URLTest,
    VlessOutbound, WebSocketTransport
} from "../../module/singbox";
import { ShuntUtils } from "../common";
import { LuciFlied, ShuntTag } from "../../enum/hijpass";
import { SingBoxEnum } from "../../enum/singbox";
import {
    Hysteria2Config,
    ProxyNode,
    RuleDTO,
    RuleSetDTO,
    ShadowsocksConfig,
    ShadowTLSConfig, ShuntConfigUtils,
    TuicConfig, VlessConfig
} from "../../module/luci";
import uci from "uci";

export const SingBoxUtils = {
    genShuntConf: genConf,
    writeGeoRule: writeGeoRule,
    genProxyConf: genProxyConf
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
            let proxyNode = new SocksOutbound("127.0.0.1", Number(section.socks_port), section.name)
            outbounds.push(proxyNode)
        }
    })

    if (shuntSection.loadBalance.lbNodeList.length > 0) {
        let lbConf = shuntSection.loadBalance
        let testNode = new URLTest(SingBoxEnum.LOAD_BALANCE_OUTBOUND_TAG, lbConf.url,
            parseInt(lbConf.interval, 10),
            parseInt(lbConf.timeout, 10),
            undefined, undefined)

        testNode.outbounds = lbConf.lbNodeList
        outbounds.push(testNode)
    }

    let inbounds = [
        new TproxyInbound(parseInt(shuntSection.shuntListenPort, 10), SingBoxEnum.TPROXY_INBOUND_TAG),
        new DnsInbound(parseInt(shuntSection.dnsListenPort, 10), SingBoxEnum.DNS_INBOUND_TAG)
    ]

    if (route.default_domain_resolver && route.final) {
        let dnsTmpl = dnsServerMap.get(route.default_domain_resolver)
        if (!dnsTmpl) {
            throw new Error("Default DNS template not found: " + route.default_domain_resolver);
        }
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
    let originalIps = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geoip_ruleset') ?? []
    let originalSites = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geosite_ruleset') ?? []

    if (geoIpList.length > 0) {
        if (!isArrEqual(originalIps, geoIpList)) {
            uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geoip_ruleset', geoIpList)
        }
    } else {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geoip_ruleset', undefined)
    }
    if (geoSiteList.length > 0) {
        if (!isArrEqual(originalSites, geoSiteList)) {
            uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geosite_ruleset', geoSiteList)
        }
    } else {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'geosite_ruleset', undefined)
    }
}

function isArrEqual(arr1, arr2) {
    if (!arr1 || !arr2) return false;
    return arr1.length === arr2.length && arr1.every((val, index) => val === arr2[index]);
}

function convert(proxyNode: ProxyNode): Outbound {

    switch (proxyNode.type) {
        case 'hysteria2':
            return createHysteria2Outbound(proxyNode as Hysteria2Config);
        case 'shadowsocks':
            return createShadowsocksOutbound(proxyNode as ShadowsocksConfig);
        case 'tuic':
            return createTuicOutbound(proxyNode as TuicConfig);
        case 'shadowtls':
            return createShadowTLSOutbound(proxyNode as ShadowTLSConfig);
        case 'vless':
            return createVlessOutbound(proxyNode as VlessConfig);
        default:
            throw new Error(`不支持的代理类型: ${proxyNode.type}`);
    }
}

function genProxyConf(proxyNode: ProxyNode): {} {
    return {
        log: {
            disabled: false,
            level: "info",
            timestamp: true
        },
        dns: {
            servers: [
                {
                    type: "local",
                    tag: "local"
                }
            ]
        },
        inbounds: [
            new TproxyInbound(Number(proxyNode.listen_port), "tproxy-in", "127.0.0.1"),
            new SocksInbound(Number(proxyNode.socks_port), "socks-in", "127.0.0.1")
        ],
        outbounds: [convert(proxyNode)]
    }
}


/**
 * 创建 Hysteria2 出站
 */
function createHysteria2Outbound(config: Hysteria2Config): Hysteria2Outbound {
    const outbound = new Hysteria2Outbound(
        config.name,
        config.server,
        parseInt(config.server_port),
        config.tls_server_name || config.server
    );

    // 设置可选字段
    if (config.password) {
        outbound.password = config.password;
    }

    if (config.up_mbps) {
        outbound.up_mbps = Number(config.up_mbps);
    }

    if (config.down_mbps) {
        outbound.down_mbps = Number(config.down_mbps);
    }

    if (config.server_ports && config.server_ports.length > 0) {
        outbound.server_ports = config.server_ports
            .map(range => range.replace('-', ':'))
            .filter(range => range.length > 0)
    }

    if (config.hop_interval) {
        outbound.hop_interval = config.hop_interval;
    }

    if (config.network) {
        outbound.network = config.network;
    }

    // OBFS 配置
    if (config.obfs_type === 'salamander' && config.obfs_password) {
        outbound.obfs = new ObfsConfig(config.obfs_password);
    }

    // TLS 配置
    outbound.tls.insecure = config.tls_insecure === '1';

    return outbound;
}

/**
 * 创建 Shadowsocks 出站
 */
function createShadowsocksOutbound(config: ShadowsocksConfig): ShadowsocksOutbound {
    const outbound = new ShadowsocksOutbound(
        config.name,
        config.server,
        parseInt(config.server_port),
        config.method,
        config.password
    );

    // 设置可选字段
    if (config.network) {
        outbound.network = config.network as 'tcp' | 'udp';
    }

    if (config.udp_over_tcp === '1') {
        outbound.udp_over_tcp = true;
    }

    if (config.plugin) {
        outbound.plugin = config.plugin;
    }

    if (config.plugin_opts) {
        outbound.plugin_opts = config.plugin_opts;
    }

    // Multiplex 配置
    if (config.multiplex_enabled === '1') {
        outbound.multiplex = createMultiplexConfig(config);
    }

    return outbound;
}

/**
 * 创建 TUIC 出站
 */
function createTuicOutbound(config: TuicConfig): TuicOutbound {
    const outbound = new TuicOutbound(
        config.name,
        config.server,
        parseInt(config.server_port),
        config.uuid,
        config.password,
        config.tls_server_name || config.server
    );

    // 设置可选字段
    if (config.congestion_control) {
        outbound.congestion_control = config.congestion_control as 'bbr' | 'cubic' | 'new_reno';
    }

    if (config.udp_relay_mode) {
        outbound.udp_relay_mode = config.udp_relay_mode as 'native' | 'quic';
    }

    if (config.udp_over_stream === '1') {
        outbound.udp_over_stream = true;
    }

    if (config.zero_rtt_handshake === '1') {
        outbound.zero_rtt_handshake = true;
    }

    if (config.heartbeat) {
        outbound.heartbeat = config.heartbeat;
    }

    if (config.network) {
        outbound.network = config.network as 'tcp' | 'udp';
    }

    // TLS 配置
    outbound.tls.insecure = config.tls_insecure === '1';

    return outbound;
}

/**
 * 创建 ShadowTLS 出站
 */
function createShadowTLSOutbound(config: ShadowTLSConfig): ShadowTLSOutbound {
    const outbound = new ShadowTLSOutbound(
        config.name,
        config.server,
        parseInt(config.server_port),
        parseInt(config.version),
        config.tls_server_name || config.server
    );

    // 设置可选字段
    if (config.password) {
        outbound.password = config.password;
    }

    // TLS 配置
    outbound.tls.insecure = config.tls_insecure === '1';

    return outbound;
}

/**
 * 创建 VLESS 出站
 */
function createVlessOutbound(config: VlessConfig): VlessOutbound {
    const outbound = new VlessOutbound(
        config.name,
        config.server,
        parseInt(config.server_port),
        config.uuid,
        config.tls_server_name || config.server
    );

    // 设置可选字段
    if (config.flow) {
        outbound.flow = config.flow as 'xtls-rprx-vision';
    }

    if (config.network) {
        outbound.network = config.network as 'tcp' | 'udp';
    }

    if (config.packet_encoding) {
        outbound.packet_encoding = config.packet_encoding as 'packetaddr' | 'xudp';
    }

    // TLS 配置
    outbound.tls.insecure = config.tls_insecure === '1';

    // Reality 配置
    if (config.tls_reality_enabled === '1' && config.tls_reality_public_key) {
        outbound.tls.reality = {
            enabled: true,
            public_key: config.tls_reality_public_key,
            short_id: config.tls_reality_short_id || ''
        };
    }

    // Transport 配置
    if (config.transport_type) {
        outbound.transport = createTransportConfig(config);
    }

    // Multiplex 配置
    if (config.multiplex_enabled === '1') {
        outbound.multiplex = createMultiplexConfig(config);
    }

    return outbound;
}

/**
 * 创建 Multiplex 配置
 */
function createMultiplexConfig(config: ShadowsocksConfig | VlessConfig): MultiplexConfig {
    const multiplex = new MultiplexConfig();

    if (config.multiplex_protocol) {
        multiplex.protocol = config.multiplex_protocol as "smux" | "yamux" | "h2mux";
    }

    if (config.multiplex_max_connections) {
        multiplex.max_connections = parseInt(config.multiplex_max_connections);
    }

    if (config.multiplex_min_streams) {
        multiplex.min_streams = parseInt(config.multiplex_min_streams);
    }

    if (config.multiplex_max_streams) {
        multiplex.max_streams = parseInt(config.multiplex_max_streams);
    }

    // Brutal 配置
    if (config.multiplex_brutal_enabled === '1') {
        const brutal = new BrutalConfig();

        if (config.multiplex_brutal_up_mbps) {
            brutal.up_mbps = parseInt(config.multiplex_brutal_up_mbps);
        }

        if (config.multiplex_brutal_down_mbps) {
            brutal.down_mbps = parseInt(config.multiplex_brutal_down_mbps);
        }

        multiplex.brutal = brutal;
    }

    return multiplex;
}

/**
 * 创建 Transport 配置
 */
function createTransportConfig(config: VlessConfig): TransportConfig | undefined {
    switch (config.transport_type) {
        case 'http':
            return createHttpTransport(config);
        case 'ws':
            return createWebSocketTransport(config);
        case 'grpc':
            return createGrpcTransport(config);
        case 'httpupgrade':
            return createHttpUpgradeTransport(config);
        default:
            return undefined;
    }
}

/**
 * 创建 HTTP Transport
 */
function createHttpTransport(config: VlessConfig): HttpTransport {
    const transport: HttpTransport = {
        type: 'http'
    };

    if (config.transport_http_host) {
        transport.host = config.transport_http_host;
    }

    if (config.transport_http_path) {
        transport.path = config.transport_http_path;
    }

    if (config.transport_http_method) {
        transport.method = config.transport_http_method;
    }

    if (config.transport_http_idle_timeout) {
        transport.idle_timeout = config.transport_http_idle_timeout;
    }

    if (config.transport_http_ping_timeout) {
        transport.ping_timeout = config.transport_http_ping_timeout;
    }

    return transport;
}

/**
 * 创建 WebSocket Transport
 */
function createWebSocketTransport(config: VlessConfig): WebSocketTransport {
    const transport: WebSocketTransport = {
        type: 'websocket'
    };

    if (config.transport_ws_path) {
        transport.path = config.transport_ws_path;
    }

    if (config.transport_ws_max_early_data) {
        transport.max_early_data = parseInt(config.transport_ws_max_early_data);
    }

    if (config.transport_ws_early_data_header_name) {
        transport.early_data_header_name = config.transport_ws_early_data_header_name;
    }

    return transport;
}

/**
 * 创建 gRPC Transport
 */
function createGrpcTransport(config: VlessConfig): GrpcTransport {
    const transport: GrpcTransport = {
        type: 'grpc'
    };

    if (config.transport_grpc_service_name) {
        transport.service_name = config.transport_grpc_service_name;
    }

    if (config.transport_grpc_idle_timeout) {
        transport.idle_timeout = config.transport_grpc_idle_timeout;
    }

    if (config.transport_grpc_ping_timeout) {
        transport.ping_timeout = config.transport_grpc_ping_timeout;
    }

    if (config.transport_grpc_permit_without_stream === '1') {
        transport.permit_without_stream = true;
    }

    return transport;
}

/**
 * 创建 HTTPUpgrade Transport
 */
function createHttpUpgradeTransport(config: VlessConfig): HttpUpgradeTransport {
    const transport: HttpUpgradeTransport = {
        type: 'httpupgrade'
    };

    if (config.transport_httpupgrade_host) {
        transport.host = config.transport_httpupgrade_host;
    }

    if (config.transport_httpupgrade_path) {
        transport.path = config.transport_httpupgrade_path;
    }

    return transport;
}