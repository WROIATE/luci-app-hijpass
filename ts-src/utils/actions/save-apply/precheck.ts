import { LuciFlied, ShuntTag } from "../../../enum/hijpass";
import uci from "uci";
import ui from "ui";
import { NotificationUtils } from "../../base/luci/notification";
import { FactoryType } from "../../../core/adapter";
import { ShuntUtils } from "../../feature/shunt/section";

const XRAY_ROUTE_PROTOCOLS = ['http', 'tls', 'quic', 'bittorrent'];

function normalizeList(value: any): string[] {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value.filter((item: string) => item) : [value];
}

function isSpecialProxyNode(node: string) {
    return node === ShuntTag.DIRECT_OUTBOUND_TAG
        || node === ShuntTag.BLOCK_OUTBOUND_TAG
        || node === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG;
}

function checkMissingProxyRefs() {
    const existingNodes = new Set<string>();
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section: any) {
        if (section.name) {
            existingNodes.add(section.name);
        }
    });

    const warnings: string[] = [];
    function checkRef(ref: string, message: string) {
        if (ref && !isSpecialProxyNode(ref) && !existingNodes.has(ref)) {
            warnings.push(message);
        }
    }

    const defaultNode = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'default_proxy_node');
    checkRef(defaultNode, _('默认全局出口 "%s" 不存在').format(defaultNode));

    const rulesetNode = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'ruleset_out_node');
    checkRef(rulesetNode, _('规则集出口 "%s" 不存在').format(rulesetNode));

    normalizeList(uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'lb_node_list'))
        .forEach((node) => checkRef(node, _('负载均衡节点 "%s" 不存在').format(node)));

    uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
        checkRef(section.proxy_node, _('路由规则 "%s" 的代理节点 "%s" 不存在').format(section.name || section['.name'], section.proxy_node));
    });

    if (warnings.length > 0) {
        NotificationUtils.warning(_('配置包含不存在的代理节点'), warnings.join('<br>'), 8000);
        return false;
    }

    return true;
}

function checkDisabledProxyRefs() {
    const disabledNodes = new Set<string>();
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section: any) {
        if (section.enabled === '0' && section.name) {
            disabledNodes.add(section.name);
        }
    });

    if (disabledNodes.size === 0) {
        return true;
    }

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

    normalizeList(uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'lb_node_list'))
        .forEach((node) => {
            if (disabledNodes.has(node)) {
                warnings.push(_('负载均衡节点 "%s" 未启用').format(node));
            }
        });

    if (warnings.length > 0) {
        NotificationUtils.warning(_('配置包含未启用的节点'), warnings.join('<br>'), 8000);
        return false;
    }

    return true;
}

function checkInvalidDnsNodeRefs() {
    const existingDnsNodes = new Set<string>();
    const disabledDnsNodes = new Set<string>();
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_DNS_NODE_TYPE, function (section: any) {
        if (!section.tag) {
            return;
        }
        existingDnsNodes.add(section.tag);
        if (section.enabled === '0') {
            disabledDnsNodes.add(section.tag);
        }
    });

    const missingWarnings: string[] = [];
    const disabledWarnings: string[] = [];
    function checkRef(ref: string, label: string) {
        if (!ref) {
            return;
        }
        if (!existingDnsNodes.has(ref)) {
            missingWarnings.push(_('%s "%s" 不存在').format(label, ref));
            return;
        }
        if (disabledDnsNodes.has(ref)) {
            disabledWarnings.push(_('%s "%s" 未启用').format(label, ref));
        }
    }

    checkRef(
        uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'default_dns_node'),
        _('默认全局DNS')
    );
    checkRef(
        uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'ruleset_dns_node'),
        _('规则集DNS')
    );
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
        checkRef(section.dns_node, _('路由规则 "%s" 的DNS节点').format(section.name || section['.name']));
    });

    if (missingWarnings.length > 0) {
        NotificationUtils.warning(_('配置包含不存在的DNS节点'), missingWarnings.join('<br>'), 8000);
        return false;
    }
    if (disabledWarnings.length > 0) {
        NotificationUtils.warning(_('配置包含未启用的DNS节点'), disabledWarnings.join('<br>'), 8000);
        return false;
    }

    return true;
}

function checkMissingDnsExitRefs() {
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
        NotificationUtils.warning(_('配置包含无效的DNS出口节点'), missingDnsExits.join('<br>'), 8000);
        return false;
    }

    return true;
}

function checkDisabledShuntFirewallPort() {
    const shuntEnabled = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'enabled');
    if (shuntEnabled !== '0') {
        return true;
    }

    const shuntListenPort = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'shunt_listen_port');
    const fwShuntPort = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.FIREWALL_SECTION_TYPE, 'shunt_port');
    if (shuntListenPort && fwShuntPort === shuntListenPort) {
        NotificationUtils.warning(_('配置冲突'), _('分流已禁用，请先将防火墙默认分流端口切换为不使用'), 8000);
        return false;
    }

    return true;
}

function checkXrayRouteProtocols() {
    const shuntType = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'type');
    if (shuntType !== FactoryType.XRAY) {
        return true;
    }

    const warnings: string[] = [];
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
        if (section.enabled === '0') {
            return;
        }

        const unsupported = normalizeList(section.protocol)
            .filter((protocol) => XRAY_ROUTE_PROTOCOLS.indexOf(protocol) === -1);
        if (unsupported.length > 0) {
            warnings.push(_('路由规则 "%s" 包含 Xray 不支持的协议: %s')
                .format(section.name || section['.name'], unsupported.join(', ')));
        }
    });

    if (warnings.length > 0) {
        NotificationUtils.warning(
            _('Xray 协议配置不支持'),
            warnings.join('<br>') + '<br>' + _('Xray route protocol 仅支持: %s').format(XRAY_ROUTE_PROTOCOLS.join(', ')),
            8000
        );
        return false;
    }

    return true;
}

function confirmWarning(title: string, description: string, warnings: string[]) {
    return new Promise<boolean>((resolve) => {
        ui.showModal(title, [
            E('div', {class: 'cbi-section'}, [
                E('div', {class: 'cbi-section-descr'}, description),
                E('ul', {style: 'margin-top: 12px;'}, warnings.map((warning) => E('li', {}, warning)))
            ]),
            E('div', {class: 'right', style: 'display:flex;justify-content:flex-end;gap:10px'}, [
                E('button', {
                    class: 'btn cbi-button',
                    click: function (ev: Event) {
                        ev.preventDefault();
                        ui.hideModal();
                        resolve(false);
                    }
                }, _('Cancel')),
                E('button', {
                    class: 'btn cbi-button-action',
                    click: function (ev: Event) {
                        ev.preventDefault();
                        ui.hideModal();
                        resolve(true);
                    }
                }, _('Continue Apply'))
            ])
        ]);
    });
}

function getSkippedRouteRuleMessage(rule: any, shuntType: string, rulesetConvert: string) {
    const ruleDTO = ShuntUtils.parseRuleList(rule);
    const ruleName = rule.name || rule['.name'] || _('Unnamed Rule');

    if (shuntType === FactoryType.XRAY) {
        if (ruleDTO.isEmpty('geo')) {
            return _('路由规则 "%s" 没有可写入 Xray 的有效匹配条件').format(ruleName);
        }
        if (ruleDTO.containRuleSet()
            && !ruleDTO.containDomain()
            && !ruleDTO.containIp()
            && !ruleDTO.containGeo()) {
            return _('路由规则 "%s" 只包含 Xray 不支持的 rule-set 目标条件').format(ruleName);
        }
        return null;
    }

    if (shuntType === FactoryType.SING_BOX) {
        if (rulesetConvert !== '1' && ruleDTO.containGeo()) {
            ruleDTO.geoSite = [];
            ruleDTO.geoIp = [];
            if (!ruleDTO.containDomain() && !ruleDTO.containIp() && !ruleDTO.containRuleSet()) {
                return _('路由规则 "%s" 去除未转换的 geosite/geoip 后没有可写入 sing-box 的目标条件').format(ruleName);
            }
        }
        if (ruleDTO.isEmpty('set')) {
            return _('路由规则 "%s" 没有可写入 sing-box 的有效匹配条件').format(ruleName);
        }
    }

    return null;
}

function confirmSkippedRouteRules() {
    const shuntType = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'type');
    const rulesetConvert = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'ruleset_convert');
    const warnings: string[] = [];

    ShuntUtils.getRouteSection().rules.forEach((rule) => {
        if (rule.enabled === '0') {
            return;
        }

        const message = getSkippedRouteRuleMessage(rule, shuntType, rulesetConvert);
        if (message) warnings.push(message);
    });

    if (warnings.length > 0) {
        return confirmWarning(
            _('部分路由规则将被跳过'),
            _('下列规则在当前核心和选项下没有可生成的有效配置，因此不会写入最终配置。是否继续应用配置？'),
            warnings
        );
    }

    return true;
}

const PrecheckUtils = {
    runSaveApplyPrechecks: async function () {
        return checkMissingProxyRefs()
            && checkDisabledProxyRefs()
            && checkInvalidDnsNodeRefs()
            && checkMissingDnsExitRefs()
            && await confirmSkippedRouteRules()
            && checkXrayRouteProtocols()
            && checkDisabledShuntFirewallPort();
    },
}

export { PrecheckUtils }
