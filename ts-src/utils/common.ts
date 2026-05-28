import { LuciFlied, PROXY_TYPE, ShuntTag } from "../enum/hijpass";
import {
    RuleDTO,
    DnsNode,
    DnsSection,
    RouteSection,
    ShuntRouteRule,
    ShuntSection,
    LoadBalanceNode, RuleSetDTO,
    ProxyNode,
    CustomProxyNode,
    Hysteria2Config,
    ShadowsocksConfig,
    TuicConfig,
    ShadowTLSConfig,
    VlessConfig
} from "../module/luci";
import rpc from "rpc";
import poll from "poll";
import uci from "uci";
import fs from "fs";
import form from "form";
import ui from "ui";
import { LuciConverterFactory, ShuntConfFactory, FactoryType } from "./factory";
import { SingBoxUtils } from "../core/singbox/builder";
import { cacheConf } from "../core/custom/cache";
import notificationManager from "../module/notification";


const callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
})

const MiscUtils = {
    getServiceInfo: async function () {
        const hijpass = await callServiceList(LuciFlied.CONF_NAME);
        const hijserver = await callServiceList(LuciFlied.SERVER_CONF_NAME);
        let serverInstances = hijserver?.[LuciFlied.SERVER_CONF_NAME]?.['instances'] ?? {};
        let instances = hijpass?.[LuciFlied.CONF_NAME]?.['instances'] ?? {};
        return {
            proxyInfos: MiscUtils.getInstanceName(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE).map(
                (name) => {
                    return instances?.[name] ?? undefined;
                }
            ).filter(instance => instance),
            shuntInfo: instances?.[MiscUtils.getInstanceName(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)[0]] ?? undefined,
            dnsInfo: instances?.[MiscUtils.getInstanceName(LuciFlied.CONF_NAME, LuciFlied.DNS_SECTION_TYPE)[0]] ?? undefined,
            serverInfos: MiscUtils.getInstanceName(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE).map(
                (name) => {
                    return serverInstances?.[name] ?? undefined;
                }
            ).filter(instance => instance),
        }
    },

    renderServiceStatus: function (res: any, type?: string) {
        let renderHTML = "";
        let spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
        let isProxyRunning = (res?.proxyInfos ?? [])
            .filter(instance => instance?.running)
            .length > 0
        let isServerRunning = (res?.serverInfos ?? [])
            .filter(instance => instance?.running)
            .length > 0
        let isShuntRunning = res?.shuntInfo?.running ?? false
        let isDnsRunning = res?.dnsInfo?.running ?? false

        let getColorSpan = function (title: string, isRunning: any) {
            if (isRunning) {
                return spanTemp.format('green', _(title), _("运行中"));
            } else {
                return spanTemp.format('red', _(title), _("未运行"));
            }
        }

        switch (type) {
            case 'dns':
                renderHTML += getColorSpan(_("DNS"), isDnsRunning)
                break;
            case 'shunt':
                renderHTML += getColorSpan(_("分流服务"), isShuntRunning)
                break;
            case 'server':
                renderHTML += getColorSpan(_("服务端"), isServerRunning)
                break;
            case 'proxy':
                renderHTML += getColorSpan(_("代理节点"), isProxyRunning)
                break;
            default:
                renderHTML += getColorSpan(_("代理节点"), isProxyRunning)
                renderHTML += getColorSpan(_("分流服务"), isShuntRunning)
                renderHTML += getColorSpan(_("DNS"), isDnsRunning)
                renderHTML += getColorSpan(_("服务端"), isServerRunning)
        }

        return renderHTML;
    },

    getInstanceName: function (confName: string, sectionType: string): string[] {
        return uci.sections(confName, sectionType).map((section) => {
            let cid = section['.name'];
            let name = section['name'] ?? section['tag'] ?? section['dns_service']
            if (!name) {
                name = sectionType
            }
            return cid + '-' + name;
        })
    },

    parseRuleSetPath: function (line: string, type: string): RuleSetDTO {
        let pathOrUrl = line.substring(type === 'remote' ? 16 : 15);
        let filename = pathOrUrl.split('/').pop();
        let tag = filename.substring(0, filename.lastIndexOf('.')) || filename;
        let format = (type === 'remote' ? pathOrUrl : filename).endsWith('srs') ? 'binary' : 'source';
        return { tag: tag, type: type, format: format, pathOrUrl: pathOrUrl }
    },

    camelToSnake: function (str: string) {
        return str.replace(/([A-Z])/g, function (match) {
            return '_' + match.toLowerCase();
        });
    },

    transFromUci: function (object: any, section: any) {
        Object.keys(object).forEach(key => {
            let uciOption = MiscUtils.camelToSnake(key)
            if (section[uciOption]) {
                object[key] = section[uciOption]
            }
        });
    },
};

const LuciUtils = {
    getServiceInstances: async function (confName: string): Promise<any> {
        const res = await callServiceList(confName);
        return res?.[confName]?.['instances'] ?? {};
    },

    refreshServiceStatus: function (type: string) {
        return async function () {
            const res = await L.resolveDefault(MiscUtils.getServiceInfo());
            let view = document.getElementById("service_status");
            if (view) view.innerHTML = MiscUtils.renderServiceStatus(res, type);
        }
    },

    renderServiceStatus: function (type?: string) {
        return function () {
            poll.add(LuciUtils.refreshServiceStatus(type));

            return E('div', { class: 'cbi-map' },
                E('fieldset', { class: 'cbi-section' }, [
                    E('p', { id: 'service_status', style: 'display: flex; gap: 1rem;' },
                        _('正在获取状态...'))
                ])
            );
        }
    },

    genHandleSaveApply: function () {
        return async function (ev: Event) {
            try {
                await this.handleSave(ev)

                // ── 以下预检均在 save 后执行，读取的是用户最新提交的配置 ──

                // 检查分流配置引用的代理节点是否都已启用
                const disabledNodes = new Set<string>();
                uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section: any) {
                    if (section.enabled === '0' && section.name) {
                        disabledNodes.add(section.name);
                    }
                });

                if (disabledNodes.size > 0) {
                    const warnings: string[] = [];

                    const defaultNode = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'default_proxy_node');
                    if (defaultNode && disabledNodes.has(defaultNode)) {
                        warnings.push(_('默认全局出口 "%s" 未启用').format(defaultNode));
                    }

                    const rulesetNode = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'ruleset_out_node');
                    if (rulesetNode && disabledNodes.has(rulesetNode)) {
                        warnings.push(_('规则集出口 "%s" 未启用').format(rulesetNode));
                    }

                    uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
                        if (section.proxy_node && disabledNodes.has(section.proxy_node)) {
                            warnings.push(_('路由规则 "%s" 的代理节点 "%s" 未启用').format(section.name || section['.name'], section.proxy_node));
                        }
                        if (section.dns_proxy_node && disabledNodes.has(section.dns_proxy_node)) {
                            warnings.push(_('路由规则 "%s" 的DNS出口节点 "%s" 未启用').format(section.name || section['.name'], section.dns_proxy_node));
                        }
                    });

                    const lbNodeList = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'lb_node_list');
                    if (Array.isArray(lbNodeList)) {
                        lbNodeList.forEach((node: string) => {
                            if (disabledNodes.has(node)) {
                                warnings.push(_('负载均衡节点 "%s" 未启用').format(node));
                            }
                        });
                    }

                    if (warnings.length > 0) {
                        WebUtils.showWarningNotification(_('配置包含未启用的节点'), warnings.join('<br>'), 8000);
                        return;
                    }
                }

                // 检查路由规则引用的 DNS 出口节点是否存在
                const existingNodeNames = new Set<string>();
                uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section: any) {
                    if (section.name) existingNodeNames.add(section.name);
                });

                const missingDnsExits: string[] = [];
                uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
                    const dnsExit = section.dns_proxy_node;
                    if (dnsExit && dnsExit !== ShuntTag.DIRECT_OUTBOUND_TAG && !existingNodeNames.has(dnsExit)) {
                        missingDnsExits.push(_('路由规则 "%s" 的DNS出口节点 "%s" 不存在').format(section.name || section['.name'], dnsExit));
                    }
                });

                if (missingDnsExits.length > 0) {
                    WebUtils.showWarningNotification(_('配置包含无效的DNS出口节点'), missingDnsExits.join('<br>'), 8000);
                    return;
                }

                // 当 shunt 未启用时，若防火墙分流端口指向 shunt 监听端口，阻止后续操作
                const shuntEnabled = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'enabled');
                if (shuntEnabled === '0') {
                    const shuntListenPort = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'shunt_listen_port');
                    const fwShuntPort = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.FIREWALL_SECTION_TYPE, 'shunt_port');
                    if (shuntListenPort && fwShuntPort === shuntListenPort) {
                        WebUtils.showWarningNotification(_('配置冲突'), _('分流已禁用，请先将防火墙默认分流端口切换为不使用'), 8000);
                        return;
                    }
                }

                // 生成分流配置并写入文件
                const shuntCoreType = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'type')
                if (shuntCoreType === FactoryType.SING_BOX
                    && uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'ruleset_convert') === '1') {
                    SingBoxUtils.writeGeoRule()
                }
                if (shuntCoreType === FactoryType.COMMAND) {
                    const shuntConf = ShuntConfFactory.getShuntUtils(FactoryType.COMMAND).genShuntConf()
                    await fs.write(WebUtils.getFilePath('shunt_conf'), shuntConf as string);
                } else {
                    let data = ShuntUtils.getShuntConfData()
                    if (uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'config_type') === 'tmpl') {
                        await fs.write(WebUtils.getFilePath('shunt_conf'), data);
                    }
                }

                // 清理已删除/重命名的代理节点文件
                let changes = await uci.changes()
                if (changes && changes.hijpass) {
                    for (let change of changes.hijpass) {
                        if (change.length === 2 && change[0] === "remove") {
                            await fs.exec("/usr/lib/hijpass/rm.sh", ['proxy', change[1]]);
                        }
                        if (change.length === 4 && change[0] === "set" && change[2] === "name") {
                            await fs.exec("/usr/lib/hijpass/rm.sh", ['proxy', change[1]]);
                        }
                    }
                }
                if (changes && changes.hijserver) {
                    for (let change of changes.hijserver) {
                        if (change.length === 2 && change[0] === "remove") {
                            await fs.exec("/usr/lib/hijpass/rm.sh", ['server', change[1]]);
                        }
                        if (change.length === 4 && change[0] === "set" && change[2] === "name") {
                            await fs.exec("/usr/lib/hijpass/rm.sh", ['server', change[1]]);
                        }
                    }
                }

                // 生成各代理节点客户端配置文件
                let tasks = uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section) => {
                    const proxyConfig = ProxyUtils.createProxyConfigFromSection(section);
                    if (proxyConfig) {
                        let proxyConf: {};
                        const nodeCore = proxyConfig.core;
                        switch (nodeCore) {
                            case 'xray':
                                proxyConf = LuciConverterFactory.genProxyConf(FactoryType.XRAY, proxyConfig);
                                break;
                            case 'singbox':
                                proxyConf = LuciConverterFactory.genProxyConf(FactoryType.SING_BOX, proxyConfig);
                                break;
                            case FactoryType.COMMAND:
                                proxyConf = LuciConverterFactory.genProxyConf(FactoryType.COMMAND, proxyConfig);
                                break;
                            default:
                                throw new Error('Unsupported core: ' + nodeCore);
                        }
                        let outData = typeof proxyConf === 'string'
                            ? proxyConf
                            : JSON.stringify(proxyConf, ShuntUtils.omitEmptyReplacer, 2)
                        return fs.write(WebUtils.getFilePath('client_dir')
                            + "/" + section.name + "-" + section[".name"] + ".json", outData);
                    }
                });
                if (tasks && tasks.length !== 0) {
                    const results = await Promise.allSettled(tasks);
                    results.forEach(result => {
                        if (result.status === 'rejected') {
                            throw new Error(result.reason.message);
                        }
                    });
                }

                ui.changes.apply(true);
            } catch (e) {
                console.log(e)
                WebUtils.showErrorNotification("配置应用失败", _(e.message), 5000);
            }
        }
    },
}

const ShuntUtils = {
    getShuntSection: function () {
        let shuntSection = new ShuntSection();
        let uSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE);
        MiscUtils.transFromUci(shuntSection, uSection)
        shuntSection.loadBalance = ShuntUtils.getLoadBalanceSection()
        shuntSection.dns = ShuntUtils.getDnsSection()
        shuntSection.route = ShuntUtils.getRouteSection()
        return shuntSection;
    },

    getRouteSection: function () {
        let shuntSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)
        let routeSection = new RouteSection();
        MiscUtils.transFromUci(routeSection, shuntSection)

        uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section) {
            let rule = new ShuntRouteRule()
            MiscUtils.transFromUci(rule, section)
            routeSection.rules.push(rule)
        })
        return routeSection;
    },

    getDnsSection: function () {
        let shuntSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)
        let dnsSection = new DnsSection();
        dnsSection.nodes = []
        MiscUtils.transFromUci(dnsSection, shuntSection)

        uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_DNS_NODE_TYPE, function (section) {
            let server = new DnsNode()
            MiscUtils.transFromUci(server, section)
            dnsSection.nodes.push(server)
        })
        return dnsSection;
    },

    getLoadBalanceSection: function () {
        let shuntSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)
        let loadBalanceSection = new LoadBalanceNode();
        MiscUtils.transFromUci(loadBalanceSection, shuntSection)
        return loadBalanceSection;
    },

    /**
     * 解析规则列表，根据前缀分类
     * @returns {RuleDTO} 包含不同类型规则的对象
     */
    parseRuleList: function (rule: ShuntRouteRule): RuleDTO {
        // 初始化结果对象
        let result = new RuleDTO();
        let domainRules = rule.domainList
        let ipRules = rule.ipList

        result.network = rule.network ? rule.network : []
        result.protocol = rule.protocol ? rule.protocol : []

        if (rule.port) {
            result.port = rule.port
                .map(port => parseInt(port, 10))
                .filter(port => !isNaN(port))
        }

        if (rule.portRange) {
            result.portRange = rule.portRange
                .map(range => range.replace('-', ':'))
                .filter(range => range.length > 0)
        }

        if (domainRules && domainRules.trim() !== '') {
            // 按行分割并处理
            let lines = domainRules.split('\n');

            for (let line of lines) {
                line = line.trim();

                // 跳过空行和注释
                if (line === '' || line.startsWith('#')) {
                    continue;
                }

                // 处理rule-set（域名和IP通用）
                if (line.startsWith('rule-set:')) {
                    let type = line.startsWith('rule-set:remote:') ? 'remote' : 'local';
                    let ruleSet = MiscUtils.parseRuleSetPath(line, type);
                    result.ruleSet.push(ruleSet);
                    continue;
                }

                // 处理域名特有规则
                if (line.startsWith('regexp:')) {
                    result.domainRegex.push(line.substring(7));
                } else if (line.startsWith('domain:')) {
                    result.domainSuffix.push(line.substring(7));
                } else if (line.startsWith('full:')) {
                    result.domain.push(line.substring(5));
                } else if (line.startsWith('geosite:')) {
                    result.geoSite.push(line)
                } else {
                    result.domainKeyword.push(line);
                }
            }
        }

        if (ipRules && ipRules.trim() !== '') {
            // 按行分割并处理
            let lines = ipRules.split('\n');
            for (let line of lines) {
                // 跳过空行和注释
                if (line === '' || line.startsWith('#')) {
                    continue;
                }

                // 处理rule-set（域名和IP通用）
                if (line.startsWith('rule-set:')) {
                    let type = line.startsWith('rule-set:remote:') ? 'remote' : 'local';
                    let ruleSet = MiscUtils.parseRuleSetPath(line, type);
                    result.ruleSet.push(ruleSet);
                    continue;
                }

                if (line.startsWith('geoip:')) {
                    result.geoIp.push(line)
                } else {
                    result.ipCidr.push(line);
                }
            }
        }

        return result;
    },

    getShuntConfData: function () {
        let data = "";
        const shuntEnabled = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'enabled');
        if (shuntEnabled === '0') return data;
        if (uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'config_type') === 'tmpl') {
            // 检查负载均衡节点列表是否为空但仍被使用
            const lbNodeList = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'lb_node_list');
            const lbEmpty = !lbNodeList || (Array.isArray(lbNodeList) && lbNodeList.filter((v: string) => v).length === 0);
            if (lbEmpty) {
                let inUse = false;
                uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
                    if (section.proxy_node === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG) inUse = true;
                });
                if (!inUse) {
                    const defaultNode = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'default_proxy_node');
                    if (defaultNode === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG) inUse = true;
                }
                if (inUse) {
                    throw new Error(_('负载均衡节点列表为空，但仍有规则使用负载均衡出口，请先移除相关规则或添加节点'));
                }
            }
            let type = uci.get_first(LuciFlied.CONF_NAME,
                LuciFlied.SHUNT_SECTION_TYPE, 'type')
            data = JSON.stringify(ShuntConfFactory.getShuntUtils(type).genShuntConf(), ShuntUtils.omitEmptyReplacer, 2)
        }
        return data;
    },

    omitEmptyReplacer: function (_: string, value: any) {
        // 过滤 value 本身为空数组的情况
        if (Array.isArray(value) && value.length === 0) {
            return undefined;  // JSON.stringify 会跳过该属性
        }
        if (value === null) {
            return undefined;
        }
        if (typeof value === 'number' && !Number.isFinite(value)) {
            return undefined;
        }
        if (typeof value === 'string' && !value.trim()) {
            return undefined;
        }
        return value;
    }
}

const ProxyUtils = {

    /**
     * 从 UCI 配置段创建对应的 ProxyNode 配置类
     */
    createProxyConfigFromSection: function (section: any): ProxyNode | null {
        const type = section.type;
        let config: ProxyNode;

        switch (type) {
            case PROXY_TYPE.HYSTERIA2:
                config = new Hysteria2Config();
                break;
            case PROXY_TYPE.SHADOWSOCKS:
                config = new ShadowsocksConfig();
                break;
            case PROXY_TYPE.TUIC:
                config = new TuicConfig();
                break;
            case PROXY_TYPE.SHADOWTLS:
                config = new ShadowTLSConfig();
                break;
            case PROXY_TYPE.VLESS:
                config = new VlessConfig();
                break;
            case PROXY_TYPE.CUSTOM:
                config = new CustomProxyNode();
                break;
            default:
                return null;
        }

        // 从 UCI 配置复制所有字段
        Object.keys(section).forEach((key) => {
            if (key !== '.type' && key !== '.name' && key !== '.anonymous') {
                (config as any)[key] = section[key];
            }
        });
        config.cfgid = section['.name'];

        return config;
    }
}

const WebUtils = {
    // 创建标签验证器
    createTagValidator: function (confName: string, sectionType: string, fieldName: string) {
        return function (section_id: any, value: any) {
            // 验证名称格式
            let formatResult = WebUtils.validateNameFormat(section_id, value);
            if (formatResult !== true) {
                return formatResult;
            }

            // 验证标签是否重复
            let duplicate = false;
            uci.sections(confName, sectionType, function (section) {
                if (section['.name'] !== section_id && section[fieldName] === value) {
                    duplicate = true;
                }
            });

            if (duplicate) {
                return _('%s已存在，请使用其他%s').format(fieldName === 'tag' ? _('标签') : _('名称'), fieldName === 'tag' ? _('标签') : _('名称'));
            }

            return true;
        };
    },


    /**
     * 获取所有已占用的端口
     */
    getUsedPorts: function (): number[] {
        let ports: number[] = [];
        uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section) => {
            if (section.listen_port) ports.push(Number(section.listen_port));
            if (section.socks_port) ports.push(Number(section.socks_port));
        });
        uci.sections(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE, (section) => {
            if (section.listen_port) ports.push(Number(section.listen_port));
        });
        const shunt = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE);
        if (shunt?.shunt_listen_port) ports.push(Number(shunt.shunt_listen_port));
        if (shunt?.dns_listen_port) ports.push(Number(shunt.dns_listen_port));
        const dns = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.DNS_SECTION_TYPE);
        if (dns?.cdg_port) ports.push(Number(dns.cdg_port));
        return ports;
    },

    /**
     * 获取除指定 section 自身外的所有已占用端口（用于复制节点场景）
     */
    getUsedPortsExcluding: function (excludeSectionId: string): number[] {
        let ports: number[] = [];
        uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section) => {
            if (section['.name'] === excludeSectionId) return;
            if (section.listen_port) ports.push(Number(section.listen_port));
            if (section.socks_port) ports.push(Number(section.socks_port));
        });
        uci.sections(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE, (section) => {
            if (section.listen_port) ports.push(Number(section.listen_port));
        });
        const shunt = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE);
        if (shunt?.shunt_listen_port) ports.push(Number(shunt.shunt_listen_port));
        if (shunt?.dns_listen_port) ports.push(Number(shunt.dns_listen_port));
        const dns = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.DNS_SECTION_TYPE);
        if (dns?.cdg_port) ports.push(Number(dns.cdg_port));
        return ports;
    },

    /**
     * 从起始端口开始查找第一个可用端口
     */
    findAvailablePort: function (startPort: number, extraExclude: number[] = []): number {
        const used = [...WebUtils.getUsedPorts(), ...extraExclude];
        let port = startPort;
        for (let i = 0; i < 1000; i++, port++) {
            if (!used.includes(port)) return port;
        }
        return startPort;
    },

    // 端口冲突检查函数
    validatePortConflict: function (sectionId: string, value: string) {
        // 检查是否与shunt配置的端口冲突
        let shuntSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)
        if (shuntSection && shuntSection[".name"] !== sectionId && (shuntSection.dns_listen_port === value
            || shuntSection.shunt_listen_port === value)) {
            return _('端口 %s 已被分流配置占用').format(value);
        }

        // 检查是否与dns配置的端口冲突
        let dnsSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.DNS_SECTION_TYPE)
        if (dnsSection && dnsSection[".name"] !== sectionId && dnsSection.cdg_port === value) {
            return _('端口 %s 已被DNS配置占用').format(value);
        }

        // 检查是否与其他proxy节点的端口冲突
        let proxySections = uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE);
        for (let i = 0; i < proxySections.length; i++) {
            let section = proxySections[i]
            if (section[".name"] === sectionId) {
                continue
            }
            if (section.listen_port === value || section.socks_port === value) {
                return _('端口 %s 已被代理节点 "%s" 使用').format(value, section.name);
            }
        }

        // 检查是否与其他server节点的端口冲突
        let serverSections = uci.sections(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE);
        for (let i = 0; i < serverSections.length; i++) {
            let section = serverSections[i]
            if (section[".name"] === sectionId) {
                continue
            }

            if (section.listen_port === value) {
                return _('端口 %s 已被服务端节点 "%s" 使用').format(value, section.name);
            }
        }
        return true;
    },

    validateNameFormat: function (sectionId: any, value: any) {
        if (!value || value === '') {
            return _('节点名称不能为空');
        }

        // 检查是否只包含英文字符、数字、下划线和连字符
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            return _('节点名称只能包含英文字母、数字、下划线和连字符');
        }

        return true;
    },

    // 生成唯一的section ID
    generateUniqueSectionId: function () {
        let chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';

        for (; ;) {
            result = '';
            // 生成8位随机字符串
            for (let i = 0; i < 8; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }

            // 检查是否已存在（检查所有可能的section类型）
            if (!uci.get(LuciFlied.CONF_NAME, result)) {
                break
            }
        }

        return result;
    },

    setAnonymousGridSectionMembers: function (section: any) {
        WebUtils.setGridSectionMembers(section);
        section.anonymous = true;
        section.sectiontitle = function (sectionId: any) {
            return uci.get(LuciFlied.CONF_NAME, sectionId, 'name')
                || uci.get(LuciFlied.CONF_NAME, sectionId, 'tag')
                || sectionId;
        };
    },

    setGridSectionMembers: function (section: any) {
        section.anonymous = false;
        section.addremove = true;
        section.sortable = true;
        section.nodescriptions = true;
        section.rowcolors = true;
    },

    simpleHash: function (str: string) {
        let hash = 0;
        str = str ? str : '';
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0; // 转32位整数
        }
        return hash;
    },

    setEditorOptionMembers: function (o: LuCI.form.TextValue, filePath: string, fieldName: string) {
        o.rows = 30;
        // 从文件读取内容
        o.load = function (_) {
            return fs.trimmed(filePath);
        };

        async function writeFile(sectionId: string, formvalue?: string) {
            let currentHash = WebUtils.simpleHash(formvalue)
            let oldHash = uci.get(LuciFlied.CONF_NAME, sectionId, fieldName)
            if (currentHash === oldHash) {
                return
            }
            uci.set(LuciFlied.CONF_NAME, sectionId, fieldName, currentHash)
            await fs.write(filePath, (formvalue || '').trim().replace(/\r\n/g, '\n') + '\n');
        }

        // 写入文件
        o.write = writeFile
        o.remove = writeFile
        o.monospace = true;

        return o;
    },

    /**
     * 为节点配置文件内容编辑器设置 load/write/remove。
     * load 从 {dirPath}/{name}-{section_id}.json 读取展示；
     * write 写入浏览器 sessionStorage 缓存，由 saveapply 统一写文件。
     * @param o         TextValue 选项
     * @param confName  UCI 配置名（读取 name 字段用）
     * @param dirPath   配置文件目录路径（仅用于 load）
     */
    setConfContentOptionMembers: function (
        o: LuCI.form.TextValue,
        confName: string,
        dirPath: string,
    ) {
        o.monospace = true;
        o.rows = 20;

        const getFilePath = (section_id: string) => {
            const name = uci.get(confName, section_id, 'name') || section_id;
            return dirPath + '/' + name + '-' + section_id + '.json';
        };

        o.load = async function (section_id: string) {
            const content = await L.resolveDefault(fs.read(getFilePath(section_id)), '');
            cacheConf(section_id, content);
            return content;
        };
        o.write = function (section_id: string, value: string) {
            cacheConf(section_id, (value || '').trim());
        };
        o.remove = function (section_id: string) {
            cacheConf(section_id, '');
        };
    },

    createTextOption: function (s: LuCI.form.AbstractSection, tabName: string,
        fieldName: string, title: string, description: string, filePath: string) {
        let o = s.taboption(tabName, form.TextValue, fieldName, title, description);
        WebUtils.setEditorOptionMembers(o, filePath, fieldName);
        return o;
    },

    getFilePath: function (option: any) {
        let path = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.GLOBAL_SECTION_TYPE, option)
        if (path) {
            return path
        }
        console.log(option + ' path is empty')
        return ''
    },

    // 设置TypedSection为单例
    setAnonymousSection: function (subsection: any) {
        subsection.anonymous = true;
        subsection.addremove = false;
    },

    /**
     * 显示通知（支持 title 和 content）
     */
    showNotification: function (options: any) {
        return notificationManager.show(options);
    },

    /**
     * 显示成功通知（支持 title 和 content）
     */
    showSuccessNotification: function (title: string, content?: string, duration?: number) {
        return notificationManager.show({ title, content, type: 'success', duration });
    },

    /**
     * 显示错误通知（支持 title 和 content）
     */
    showErrorNotification: function (title: string, content?: string, duration?: number) {
        return notificationManager.show({ title, content, type: 'error', duration });
    },

    /**
     * 显示警告通知（支持 title 和 content）
     */
    showWarningNotification: function (title: string, content?: string, duration?: number) {
        return notificationManager.show({ title, content, type: 'warning', duration });
    },

    /**
     * 显示信息通知（支持 title 和 content）
     */
    showInfoNotification: function (title: string, content?: string, duration?: number) {
        return notificationManager.show({ title, content, type: 'info', duration });
    },

    /**
     * 清空所有通知
     */
    clearNotifications: function () {
        return notificationManager.clear();
    },

    createLogFlagOption: function (s: LuCI.form.AbstractSection, conf_type: string, tab: string) {
        let log_dir = uci.get_first(conf_type, conf_type, 'log_dir');

        let o = tab ? s.taboption(tab, form.Flag, 'log_enabled', _('记录日志'))
            : s.option(form.Flag, 'log_enabled', _('记录日志'));
        o.modalonly = true;
        o.write = function (section_id: string, value: string) {
            let log_file = 'shunt.log'
            let name = uci.get(conf_type, section_id, 'name');
            if (name) {
                log_file = name + '-' + section_id + '.log'
            }

            uci.set(conf_type, section_id, 'log_path', log_dir + '/' + log_file);
        }
        o.remove = function (section_id: string) {
            uci.unset(conf_type, section_id, 'log_path');
        }
        o.load = function (section_id: string) {
            if (uci.get(conf_type, section_id, 'log_path')) {
                return '1'
            }
            return '0'
        }
        o.rmempty = true;
        return o;
    },

    createServiceStatusSection: function (m: LuCI.form.Map, type?: string) {
        let s = m.section(form.TypedSection);
        s.anonymous = true;
        s.render = LuciUtils.renderServiceStatus(type);
        return s;
    },

    /**
     * 将所有启用节点的 listen_port 追加为下拉选项（用于防火墙端口选择场景）。
     */
    appendEnabledNodeListenPorts: function (option: LuCI.form.ListValue) {
        uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section: any) => {
            if (section.listen_port && section.enabled !== '0') {
                let displayName = _('代理节点 %s: %s').format(section.name, section.listen_port);
                option.value(section.listen_port, displayName);
            }
        });
    },

    /**
     * 为 ListValue/DynamicList 动态加载启用的代理节点选项。
     * @param option      目标选项
     * @param includeSlb  是否追加阻止和负载均衡条目（默认 true）
     */
    loadProxyNodeOptions: function (option: LuCI.form.AbstractValue, includeSlb: boolean = true) {
        option.load = function (section_id: string) {
            delete this.keylist;
            delete this.vallist;

            this.value(ShuntTag.DIRECT_OUTBOUND_TAG, _('直连'));
            if (includeSlb) {
                this.value(ShuntTag.BLOCK_OUTBOUND_TAG, _('阻止'));
            }

            uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section: any) {
                if (section.name && section.enabled !== '0') {
                    let displayName = section.name;
                    if (section.socks_port) displayName += ' (' + section.socks_port + ')';
                    this.value(section.name, displayName);
                }
            }.bind(this));

            if (includeSlb) {
                const lbList = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'lb_node_list');
                if (lbList && lbList.length > 0) {
                    this.value(ShuntTag.LOAD_BALANCE_OUTBOUND_TAG, _('负载均衡'));
                }
            }

            return form.ListValue.prototype.load.apply(this, [section_id]);
        };
    },

    /**
     * 获取所有启用代理节点的列表（用于构建 modal 里的原生 select 等场景）。
     * @param includeSpecial 是否包含直连/阻止/负载均衡条目（默认 true）
     */
    getEnabledProxyNodeOptions: function (includeSpecial: boolean = true): { value: string, label: string }[] {
        const options: { value: string, label: string }[] = [];

        if (includeSpecial) {
            options.push({ value: ShuntTag.DIRECT_OUTBOUND_TAG, label: _('直连') });
            options.push({ value: ShuntTag.BLOCK_OUTBOUND_TAG, label: _('阻止') });
        }

        uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section: any) => {
            if (section.name && section.enabled !== '0') {
                let label = section.name;
                if (section.socks_port) label += ' (' + section.socks_port + ')';
                options.push({ value: section.name, label });
            }
        });

        if (includeSpecial) {
            const lbList = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'lb_node_list');
            if (lbList && lbList.length > 0) {
                options.push({ value: ShuntTag.LOAD_BALANCE_OUTBOUND_TAG, label: _('负载均衡') });
            }
        }

        return options;
    },
}

export { LuciUtils, WebUtils, ShuntUtils, ProxyUtils }