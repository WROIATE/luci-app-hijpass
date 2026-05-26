import { LuciUtils, ShuntUtils, WebUtils } from "../utils/common";

import { HijpassValues, LuciFlied } from "../enum/hijpass";
import ui from 'ui';
import form from "form";
import view from 'view';
import uci from 'uci';
import fs from 'fs';

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME)
        ]);
    },

    handleSave: async function (ev: Event) {
        try {
            await view.prototype.handleSave(ev)
        } catch (e) {
            console.log(e);
            WebUtils.showErrorNotification(_('Configuration Save Failed'), _(e.message), 5000);
        }
    },

    handleSaveApply: LuciUtils.genHandleSaveApply(),

    render: function () {
        let m = new form.Map(LuciFlied.CONF_NAME, _('Shunt Configuration'),
            _('Configure Shunt Rules'));
        WebUtils.createServiceStatusSection(m, 'shunt');

        let s = m.section(form.TypedSection, LuciFlied.SHUNT_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;
        // 创建标签页
        createTabs(s);

        // 创建基础配置选项
        createBasicOptions(s);
        createConfigEditor(s);
        createRouteOptions(s);
        createDNSOptions(s);
        createSLBOptions(s);
        return m.render();
    }
})

// 创建基础配置选项
function createBasicOptions(s: LuCI.form.AbstractSection) {
    // 总开关
    let enabled = s.taboption('basic', form.Flag, 'enabled', _('Enable Shunt'), _(''));
    enabled.default = '1';
    enabled.rmempty = false;

    // 分流类型
    let serviceType = s.taboption('basic', form.ListValue, 'type', _('Shunt Type'),
        _('Select Shunt Type'));
    HijpassValues.SHUNT_CONF_TYPE.forEach(function (type) {
        serviceType.value(type);
    })
    serviceType.default = 'xray';
    serviceType.rmempty = false;

    let configType = s.taboption('basic', form.ListValue, 'config_type', _('Configuration Type'),
        _('Select Configuration Type'));
    configType.value('tmpl', _('Template Configuration'));
    configType.value('custom', _('Custom Edit'));
    configType.rmempty = true;

    // 分流监听端口
    let shuntListenPort = s.taboption('basic', form.Value, 'shunt_listen_port', _('Shunt Listen Port'),
        _('Shunt Listen Port'));
    shuntListenPort.default = '1041';
    shuntListenPort.datatype = 'port';
    shuntListenPort.rmempty = false;
    shuntListenPort.validate = function (sectionId: string, value: string) {
        let dns_listen_port = uci.get(LuciFlied.CONF_NAME, sectionId, "dns_listen_port");
        if (dns_listen_port === value) {
            return _("Conflicts with DNS Port")
        }
        return WebUtils.validatePortConflict.call(this, sectionId, value);
    }

    // DNS监听端口
    let dnsListenPort = s.taboption('basic', form.Value, 'dns_listen_port', _('DNS Listen Port'),
        _('DNS Listen Port'));
    dnsListenPort.default = '10153';
    dnsListenPort.datatype = 'port';
    dnsListenPort.rmempty = false;
    dnsListenPort.validate = function (sectionId: string, value: string) {
        let shunt_listen_port = uci.get(LuciFlied.CONF_NAME, sectionId, "shunt_listen_port");
        if (shunt_listen_port === value) {
            return _("Conflicts with Shunt Port")
        }
        return WebUtils.validatePortConflict.call(this, sectionId, value);
    }

    // 日志开关
    WebUtils.createLogFlagOption(s, LuciFlied.CONF_NAME, 'basic');

    // 日志路径
    let logLevel = s.taboption('basic', form.ListValue, 'log_level', _('Log Level'), _('Logging Level'));
    HijpassValues.SHUNT_LOG_LEVELS.forEach(function (level) {
        logLevel.value(level);
    })
    logLevel.depends('log_enabled', '1');

    // ── Core 版本显示 & 更新 ──────────────────────────────────────────

    // sing-box 版本 + 更新按钮
    let sbVersionOpt = s.taboption('basic', form.DummyValue, '_singbox_version', _('sing-box Version'));
    sbVersionOpt.renderWidget = function () {
        const versionEl = E('span', { style: 'margin-right:12px;color:#666' }, _('Loading...'));
        const updateBtn = E('button', {
            class: 'btn cbi-button',
            style: 'background-color:#1a6a8a;border-color:#1a6a8a',
            click: function (ev: MouseEvent) {
                const btn = ev.currentTarget as HTMLButtonElement;
                btn.disabled = true;
                btn.textContent = _('Updating...');
                fs.exec_direct('/usr/lib/hijpass/core-update.sh', ['update', 'sing-box'], 'json')
                    .then((res: any) => {
                        if (res && res.success) {
                            versionEl.textContent = res.version || _('Updated');
                            WebUtils.showSuccessNotification('sing-box', _('Updated to %s').format(res.version), 4000);
                        } else {
                            WebUtils.showErrorNotification('sing-box', _('Update failed: %s').format((res && res.error) || 'unknown'), 5000);
                        }
                    })
                    .catch((e: any) => {
                        WebUtils.showErrorNotification('sing-box', _(e.message || 'Update failed'), 5000);
                    })
                    .finally(() => {
                        btn.disabled = false;
                        btn.textContent = _('Update');
                    });
            }
        }, _('Update'));

        // 初始加载版本
        fs.exec_direct('/usr/lib/hijpass/core-update.sh', ['version', 'sing-box'], 'json')
            .then((res: any) => {
                versionEl.textContent = (res && res.version) ? res.version : _('Unknown');
            })
            .catch(() => { versionEl.textContent = _('Unknown'); });

        return E('div', { style: 'display:flex;align-items:center;gap:8px' }, [versionEl, updateBtn]);
    };

    // xray 版本 + 更新按钮
    let xrayVersionOpt = s.taboption('basic', form.DummyValue, '_xray_version', _('Xray Version'));
    xrayVersionOpt.renderWidget = function () {
        const versionEl = E('span', { style: 'margin-right:12px;color:#666' }, _('Loading...'));
        const updateBtn = E('button', {
            class: 'btn cbi-button',
            style: 'background-color:#1a6a8a;border-color:#1a6a8a',
            click: function (ev: MouseEvent) {
                const btn = ev.currentTarget as HTMLButtonElement;
                btn.disabled = true;
                btn.textContent = _('Updating...');
                fs.exec_direct('/usr/lib/hijpass/core-update.sh', ['update', 'xray'], 'json')
                    .then((res: any) => {
                        if (res && res.success) {
                            versionEl.textContent = res.version || _('Updated');
                            WebUtils.showSuccessNotification('Xray', _('Updated to %s').format(res.version), 4000);
                        } else {
                            WebUtils.showErrorNotification('Xray', _('Update failed: %s').format((res && res.error) || 'unknown'), 5000);
                        }
                    })
                    .catch((e: any) => {
                        WebUtils.showErrorNotification('Xray', _(e.message || 'Update failed'), 5000);
                    })
                    .finally(() => {
                        btn.disabled = false;
                        btn.textContent = _('Update');
                    });
            }
        }, _('Update'));

        // 初始加载版本
        fs.exec_direct('/usr/lib/hijpass/core-update.sh', ['version', 'xray'], 'json')
            .then((res: any) => {
                versionEl.textContent = (res && res.version) ? res.version : _('Unknown');
            })
            .catch(() => { versionEl.textContent = _('Unknown'); });

        return E('div', { style: 'display:flex;align-items:center;gap:8px' }, [versionEl, updateBtn]);
    };

    // 预览配置按钮
    let previewConfigButton = s.taboption('basic', form.Button, '_preview_config', _('Preview Configuration'),
        _('Click to Preview'));
    previewConfigButton.depends('config_type', 'tmpl');
    previewConfigButton.inputtitle = _('Preview Configuration');
    previewConfigButton.inputstyle = 'apply';
    previewConfigButton.onclick = preview
}


function createConfigEditor(s: LuCI.form.AbstractSection) {
    let o = s.taboption('config', form.TextValue, 'shunt_hash', null, '修改分流配置文件');
    o.depends('config_type', 'custom')
    WebUtils.setEditorOptionMembers(o, WebUtils.getFilePath('shunt_conf'), 'shunt_hash');
    let defaultWrite = o.write
    o.write = shuntConfWrite(defaultWrite)
    o.remove = shuntConfWrite(defaultWrite)
    o.rmempty = false;
}

// 创建路由配置选项
function createRouteOptions(s: LuCI.form.AbstractSection) {
    // 默认全局路由出口配置
    let routeTypeSectionValue = createSectionContainer(s, 'route', '_route_global',
        form.TypedSection, LuciFlied.SHUNT_SECTION_TYPE, _(''));

    let routeTypeSection = routeTypeSectionValue.subsection;
    WebUtils.setAnonymousSection(routeTypeSection);

    let defaultProxyNode = createRequiredListValue(routeTypeSection, 'default_proxy_node', _('Default Global Exit'),
        _('Select Default Exit Node'),
        function (section_id: any, value: any) {
            if (!value) {
                return _('Configure Global Exit First');
            }
            return true;
        });
    loadProxyNodeOptions(defaultProxyNode, true);

    let rulesetOutNode = routeTypeSection.option(form.ListValue, 'ruleset_out_node', _('Rule-set Exit'),
        _('Rule-set Download Exit'));
    loadProxyNodeOptions(rulesetOutNode, false);

    let rulesetConvert = routeTypeSection.option(form.Flag, 'ruleset_convert',
        _('Use GeoSite Rule-set'), _('Convert Geo Rules'));
    rulesetConvert.rmempty = false;
    // 批量替换节点按钮
    let replaceNodeBtn = s.taboption('route', form.Button, '_replace_node', _('Bulk Replace Nodes'));
    replaceNodeBtn.depends({ config_type: "tmpl" });
    replaceNodeBtn.inputtitle = _('Bulk Replace Nodes');
    replaceNodeBtn.inputstyle = 'apply';
    replaceNodeBtn.onclick = function () {
        // 收集规则中实际被使用的节点值
        const usedNodeValues = new Set<string>();
        uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
            if (section.proxy_node) usedNodeValues.add(section.proxy_node);
        });

        // 构建全量节点选项列表（用于"替换为"）
        const allNodeOptions = WebUtils.getEnabledProxyNodeOptions(true);

        // "从节点"只显示规则中实际使用的节点
        const fromNodeOptions = allNodeOptions.filter(o => usedNodeValues.has(o.value));

        const makeSelect = (id: string, options: { value: string, label: string }[]) => {
            const sel = E('select', { id, class: 'cbi-input-select', style: 'width:100%' }) as HTMLSelectElement;
            options.forEach(({ value, label }) => {
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = label;
                sel.appendChild(opt);
            });
            return sel;
        };

        const fromSel = makeSelect('replace-from', fromNodeOptions);
        const toSel = makeSelect('replace-to', allNodeOptions);

        ui.showModal(_('Bulk Replace Nodes'), [
            E('div', { class: 'cbi-section' }, [
                E('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:center' }, [
                    E('div', {}, [E('label', {}, _('From Node')), fromSel]),
                    E('div', {}, [E('label', {}, _('Replace With')), toSel]),
                ])
            ]),
            E('div', { class: 'right', style: 'display:flex;justify-content:flex-end;gap:10px' }, [
                E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('Cancel')),
                E('button', {
                    class: 'btn cbi-button-action',
                    click: function () {
                        const fromVal = fromSel.value;
                        const toVal = toSel.value;
                        if (fromVal === toVal) {
                            ui.hideModal();
                            return;
                        }
                        let count = 0;
                        uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
                            if (section.proxy_node === fromVal) {
                                uci.set(LuciFlied.CONF_NAME, section['.name'], 'proxy_node', toVal);
                                count++;
                            }
                        });
                        uci.save();
                        ui.hideModal();
                        location.reload();
                    }
                }, _('Confirm Replace'))
            ])
        ]);
    };

    // 路由规则配置
    let routeGridSectionValue = s.taboption('route', form.SectionValue, '_route_rule',
        form.GridSection, LuciFlied.SHUNT_ROUTE_RULE_TYPE, _('Routing Rule Configuration'));
    routeGridSectionValue.depends({ config_type: "tmpl" })

    let routeGridSection = routeGridSectionValue.subsection;
    routeGridSection.rowcolors = true
    WebUtils.setAnonymousGridSectionMembers(routeGridSection)
    routeGridSection.modaltitle = _('Edit Routing Rule');
    routeGridSection.sectiontitle = function (section_id: any) {
        return uci.get(LuciFlied.CONF_NAME, section_id, 'name') || _('Unnamed Rule');
    };
    routeGridSection.rowcolors = true
    routeGridSection.tab('_rule', _('规则'));
    routeGridSection.tab('_dns', _('DNS Configuration'));

    // 规则名称
    let name = routeGridSection.taboption('_rule', form.Value, 'name', _('Rule Name'));
    name.validate = WebUtils.createTagValidator(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, 'name')
    name.rmempty = false;
    name.modalonly = true;

    // 启用开关（从路由配置移过来）
    let enabled = routeGridSection.taboption('_rule', form.Flag, 'enabled', _('Enable'));
    enabled.default = '1';
    enabled.rmempty = false;
    enabled.editable = true;

    // 代理节点（动态生成选项）
    let proxyNode = routeGridSection.taboption('_rule', form.ListValue, 'proxy_node', _('Proxy Node'));
    proxyNode.rmempty = false;
    proxyNode.editable = true;
    loadProxyNodeOptions(proxyNode, true);  // 包含阻止和负载均衡

    // DNS服务器（动态生成选项）
    let dnsNode = routeGridSection.taboption('_dns', form.ListValue, 'dns_node', _('DNS Server'), _('Only Effective with Domain/GeoSite/Rule-set'));
    // dnsNode.modalonly = true;
    loadDNSServerOptions(dnsNode, true);  // 包含默认选项
    dnsNode.textvalue = function (sectionId) {
        let dnsNode = uci.get(LuciFlied.CONF_NAME, sectionId, 'dns_node');
        if (!dnsNode) {
            return _('-');
        }
        let dnsProxyNode = uci.get(LuciFlied.CONF_NAME, sectionId, 'dns_proxy_node');
        let value: string;
        if (!dnsProxyNode) {
            value = dnsNode
        } else {
            dnsProxyNode = dnsProxyNode === 'hijpass-direct' ? _('Direct') : dnsProxyNode;
            value = dnsNode + ' -> ' + dnsProxyNode;
        }
        return value;
    }

    let dnsStrategy = routeGridSection.taboption('_dns', form.ListValue, 'dns_strategy', _('DNS Resolution Strategy'));
    dnsStrategy.value('', _('Use Global Default Resolution Strategy'))
    HijpassValues.DNS_STRATEGY_VALUES.forEach(function (strategy) {
        dnsStrategy.value(strategy.value, strategy.label);
    });
    dnsStrategy.modalonly = true;

    let dnsProxyNode = routeGridSection.taboption('_dns', form.ListValue, 'dns_proxy_node', _('DNS Exit Node'));
    dnsProxyNode.value('', _('Use Routing Proxy Node'));
    dnsProxyNode.value('hijpass-direct', _('Direct'));
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section) {
        if (section.name && section.enabled !== '0') {
            let displayName = section.name;
            if (section.socks_port) {
                displayName += ' (' + section.socks_port + ')';
            }
            dnsProxyNode.value(section.name, displayName);
        }
    });
    dnsProxyNode.modalonly = true;

    // 网络
    let network = routeGridSection.taboption('_rule', form.MultiValue, 'network', _('网络'));
    network.value('tcp');
    network.value('udp');
    network.cfgvalue = function (sectionId) {
        let networks = uci.get(LuciFlied.CONF_NAME, sectionId, 'network');
        if (networks) {
            return networks.join(',');
        }
        return '-';
    }
    // network.modalonly = true

    // 协议
    let protocol = routeGridSection.taboption('_rule', form.MultiValue, 'protocol', _('协议'), _('当前xray仅支持http、tls、quic和bittorrent'));
    protocol.value('tls');
    protocol.value('http');
    protocol.value('quic');
    protocol.value('stun');
    protocol.value('dns');
    protocol.value('bittorrent');
    protocol.value('dtls');
    protocol.value('ssh');
    protocol.value('rdp');
    protocol.value('ntp');
    // protocol.modalonly = true
    protocol.cfgvalue = function (sectionId) {
        let protocols = uci.get(LuciFlied.CONF_NAME, sectionId, 'protocol');
        if (protocols) {
            return protocols.join(',')
        }
        return '-';
    }

    // 端口
    let port = routeGridSection.taboption('_rule', form.DynamicList, 'port', _('Port'));
    port.datatype = 'port';
    port.placeholder = '80';
    port.modalonly = true

    // 端口范围
    let portRange = routeGridSection.taboption('_rule', form.DynamicList, 'port_range', _('Port Range'));
    portRange.datatype = 'portrange';
    portRange.placeholder = '1000-2000';
    portRange.modalonly = true

    let portView = routeGridSection.option(form.TextValue, '_port_view', _('Port Range'))
    portView.textvalue = function (sectionId) {
        let port = uci.get(LuciFlied.CONF_NAME, sectionId, 'port');
        let portRange = uci.get(LuciFlied.CONF_NAME, sectionId, 'port_range');
        let value = []
        if (port) {
            value.push(...port)
        }
        if (portRange) {
            value.push(...portRange)
        }
        return value.join(',') || '-';
    }
    portView.modalonly = false

    // 域名规则列表
    let domainList = routeGridSection.taboption('_rule', form.TextValue, 'domain_list', _('Domain Rule List'), _('纯字符串: 当此字符串匹配目标域名中任意部分，该规则生效。<br>' +
        '正则表达式: 由\'regexp:\'开始，余下部分是一个正则表达式。<br>' +
        '子域名 (推荐): 由\'domain:\'开始，余下部分是一个域名。当此域名是目标域名或其子域名时，该规则生效。<br>' +
        '完整匹配: 由\'full:\'开始，余下部分是一个域名。当此域名完整匹配目标域名时，该规则生效。<br>' +
        'geosite: 形如\'geosite:cn\'。<br>' +
        'rule-set: 形如\'rule-set:local:/path/rulefile\'或\'rule-set:remote:https://file\'。<br>' +
        '注释: 由 # 开头'));
    domainList.rows = 4;
    domainList.monospace = true;
    domainList.modalonly = true

    let domainListView = routeGridSection.option(form.TextValue, '_domain_list_view', _('域名规则数'))
    domainListView.textvalue = function (sectionId) {
        let domainList = uci.get(LuciFlied.CONF_NAME, sectionId, 'domain_list');
        if (domainList) {
            return domainList.split('\n').filter(item => !item.startsWith('#')).length;
        }
        return '-';
    }

    // IP规则列表
    let ipList = routeGridSection.taboption('_rule', form.TextValue, 'ip_list', _('IP Rule List'), _('IP: 形如\'127.0.0.1\'。<br>' +
        'CIDR: 形如\'10.0.0.0/8\'.<br>' +
        'geoip: 形如\'geoip:cn\'。<br>' +
        'rule-set: 形如\'rule-set:local:/path/rulefile\'或\'rule-set:remote:https://file\'。<br>' +
        '注释: 由 # 开头'));
    ipList.rows = 4;
    ipList.monospace = true;
    ipList.modalonly = true

    let ipListView = routeGridSection.option(form.TextValue, '_ip_list_view', _('IP规则数'))
    ipListView.textvalue = function (sectionId) {
        let ipList = uci.get(LuciFlied.CONF_NAME, sectionId, 'ip_list');
        if (ipList) {
            return ipList.split('\n').filter(item => !item.startsWith('#')).length;
        }
        return '-';
    }
}


// 创建DNS服务器配置选项
function createDNSOptions(s: LuCI.form.AbstractSection) {

    let dnsTypeSectionValue = createSectionContainer(s, 'dns', '_dns_global',
        form.TypedSection, LuciFlied.SHUNT_SECTION_TYPE, _(''));

    let dnsTypeSection = dnsTypeSectionValue.subsection;
    WebUtils.setAnonymousSection(dnsTypeSection);

    // 默认全局DNS配置
    let defaultDNSNode = createRequiredListValue(dnsTypeSection, 'default_dns_node', _('Default Global DNS'),
        _('Select Default DNS'),
        function (section_id: string, value: any) {
            if (!value) {
                return _('请先配置全局DNS服务器');
            }
            return true;
        });
    loadDNSServerOptions(defaultDNSNode, false);

    let rulesetDNSNode = dnsTypeSection.option(form.ListValue, 'ruleset_dns_node',
        _('Rule-set DNS'), _('Select Rule-set DNS'));
    loadDNSServerOptions(rulesetDNSNode, false);

    let defaultStrategy = dnsTypeSection.option(form.ListValue, 'default_strategy', _('Internal DNS Resolution Strategy'),
        _('Select DNS Resolution Strategy'));
    HijpassValues.DNS_STRATEGY_VALUES.forEach(function (strategy) {
        defaultStrategy.value(strategy.value, strategy.label);
    });
    defaultStrategy.rmempty = false;

    let useCache = dnsTypeSection.option(form.Flag, 'use_cache', _('DNS Cache'));
    useCache.rmempty = false;

    let dnsGridSectionValue = s.taboption('dns', form.SectionValue, '_dns_servers',
        form.GridSection, LuciFlied.SHUNT_DNS_NODE_TYPE, _('DNS Node Configuration'));
    dnsGridSectionValue.depends({ config_type: "tmpl" })

    let dnsGridSection = dnsGridSectionValue.subsection;
    dnsGridSection.rowcolors = true
    dnsGridSection.anonymous = true;
    dnsGridSection.addremove = true;
    dnsGridSection.sortable = true;
    dnsGridSection.nodescriptions = true;
    dnsGridSection.modaltitle = _('Edit DNS Server');
    dnsGridSection.sectiontitle = function (section_id) {
        return uci.get(LuciFlied.CONF_NAME, section_id, 'tag') || _('未命名');
    };

    // DNS类型
    let type = dnsGridSection.option(form.ListValue, 'type', _('类型'),
        _('DNS Server Type'));
    type.value('tcp', 'TCP');
    type.value('udp', 'UDP');
    type.value('tls', 'TLS（仅sing-box支持）');
    type.value('https', 'HTTPS');
    type.value('quic', 'QUIC');
    type.default = 'tcp';
    type.rmempty = false;

    // DNS标签
    let tag = dnsGridSection.option(form.Value, 'tag', _('Tag'),
        _('DNS Server Tag'));
    tag.placeholder = 'dns-local';
    tag.rmempty = false;
    tag.validate = WebUtils.createTagValidator(LuciFlied.CONF_NAME, LuciFlied.SHUNT_DNS_NODE_TYPE, 'tag')
    tag.modalonly = true

    // DNS服务器地址
    let server = dnsGridSection.option(form.Value, 'server', _('服务器'),
        _('DNS Server Address'));
    server.placeholder = '8.8.8.8';
    server.datatype = 'ipaddr';
    server.rmempty = false;

    // DNS服务器端口
    let port = dnsGridSection.option(form.Value, 'port', _('Port'),
        _('DNS Server Port'));
    port.placeholder = '53';
    port.datatype = 'port';
    port.rmempty = true;
}

// 创建负载均衡选项
function createSLBOptions(s: LuCI.form.AbstractSection) {
    const lbNodeLoader = function (section: any) {
        if (section.name && section.enabled !== '0') {
            let displayName = section.name;
            if (section.socks_port) displayName += ' (' + section.socks_port + ')';
            return { value: section.name, display: displayName };
        }
        return null;
    };

    // ── global：节点列表（xray 和 sing-box 都显示）──────────────────────
    let oGlobal = s.taboption('slb', form.SectionValue, '_slb_global',
        form.TypedSection, LuciFlied.SHUNT_SECTION_TYPE, _(''));
    oGlobal.depends({ config_type: 'tmpl', type: 'xray' });
    oGlobal.depends({ config_type: 'tmpl', type: 'sing-box' });
    let gSs = oGlobal.subsection;
    gSs.anonymous = true;
    gSs.addremove = false;

    createValidatedDynamicList(gSs, 'lb_node_list', _('Load Balancing Nodes'),
        _('Load Balancing Nodes'),
        LuciFlied.PROXY_NODE_TYPE, lbNodeLoader);

    // ── sing-box：URLTest 参数 ────────────────────────────────────────
    let oSingBox = s.taboption('slb', form.SectionValue, '_slb_singbox',
        form.TypedSection, LuciFlied.SHUNT_SECTION_TYPE, _('sing-box URLTest'));
    oSingBox.depends({ config_type: 'tmpl', type: 'sing-box' });
    let sbSs = oSingBox.subsection;
    sbSs.anonymous = true;
    sbSs.addremove = false;

    let sbUrl = sbSs.option(form.Value, 'url', _('Test URL'),
        _('Health Check URL'));
    sbUrl.placeholder = 'https://www.gstatic.com/generate_204';

    let sbInterval = sbSs.option(form.Value, 'interval', _('Test Interval'),
        _('Health Check Interval'));
    sbInterval.placeholder = '3m';

    let sbTolerance = sbSs.option(form.Value, 'tolerance', _('Tolerance (ms)'),
        _('Tolerance'));
    sbTolerance.placeholder = '50';
    sbTolerance.datatype = 'uinteger';

    let sbIdleTimeout = sbSs.option(form.Value, 'idle_timeout', _('Idle Timeout'),
        _('Node Idle Timeout'));
    sbIdleTimeout.placeholder = '30m';

    sbSs.option(form.Flag, 'interrupt_exist_connections', _('Interrupt Existing Connections'),
        _('Interrupt on Outbound Change'));

    // ── xray：Balancer + BurstObservatory 参数 ────────────────────────
    let oXray = s.taboption('slb', form.SectionValue, '_slb_xray',
        form.TypedSection, LuciFlied.SHUNT_SECTION_TYPE, _('Xray Balancer'));
    oXray.depends({ config_type: 'tmpl', type: 'xray' });
    let xSs = oXray.subsection;
    xSs.anonymous = true;
    xSs.addremove = false;

    let xrayStrategy = xSs.option(form.ListValue, 'strategy', _('Load Strategy'),
        _('Load Balancing Strategy'));
    xrayStrategy.value('random', _('Random'));
    xrayStrategy.value('roundRobin', _('Round Robin'));
    xrayStrategy.value('leastPing', _('Lowest Ping'));
    xrayStrategy.value('leastLoad', _('Lowest Load'));
    xrayStrategy.default = 'leastLoad';

    let xrayExpected = xSs.option(form.Value, 'strategy_expected', _('Best Nodes'),
        _('Best Nodes Count'));
    xrayExpected.placeholder = '1';
    xrayExpected.datatype = 'uinteger';
    xrayExpected.depends('strategy', 'leastLoad');

    let xrayMaxRtt = xSs.option(form.Value, 'strategy_max_rtt', _('Max Acceptable RTT'),
        _('Max Acceptable RTT'));
    xrayMaxRtt.placeholder = '1s';
    xrayMaxRtt.depends('strategy', 'leastLoad');

    let xrayTolerance = xSs.option(form.Value, 'strategy_tolerance', _('Failure Rate Tolerance'),
        _('Failure Rate Tolerance'));
    xrayTolerance.placeholder = '0.05';
    xrayTolerance.depends('strategy', 'leastLoad');

    let xrayFallback = xSs.option(form.ListValue, 'fallback_tag', _('Fallback Node'),
        _('Fallback Outbound'));
    xrayFallback.value('', _('无'));
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section: any) => {
        if (section.name && section.enabled !== '0') xrayFallback.value(section.name, section.name);
    });

    let xrayProbeUrl = xSs.option(form.Value, 'probe_url', _('Probe URL'),
        _('Health Check Probe URL'));
    xrayProbeUrl.placeholder = 'https://connectivitycheck.gstatic.com/generate_204';
    xrayProbeUrl.depends('strategy', 'leastPing');
    xrayProbeUrl.depends('strategy', 'leastLoad');

    let xrayProbeConnectivity = xSs.option(form.Value, 'probe_connectivity', _('Local Connectivity Check URL'),
        _('Local Connectivity Check URL'));
    xrayProbeConnectivity.depends('strategy', 'leastPing');
    xrayProbeConnectivity.depends('strategy', 'leastLoad');

    let xrayProbeInterval = xSs.option(form.Value, 'probe_interval', _('Probe Interval'),
        _('Probe Interval'));
    xrayProbeInterval.placeholder = '1m';
    xrayProbeInterval.depends('strategy', 'leastPing');
    xrayProbeInterval.depends('strategy', 'leastLoad');

    let xrayProbeTimeout = xSs.option(form.Value, 'probe_timeout', _('Probe Timeout'),
        _('Probe Timeout'));
    xrayProbeTimeout.placeholder = '5s';
    xrayProbeTimeout.depends('strategy', 'leastPing');
    xrayProbeTimeout.depends('strategy', 'leastLoad');

    let xrayProbeSampling = xSs.option(form.Value, 'probe_sampling', _('Results to Retain'),
        _('Retain Recent Probe Results'));
    xrayProbeSampling.placeholder = '10';
    xrayProbeSampling.datatype = 'uinteger';
    xrayProbeSampling.depends('strategy', 'leastPing');
    xrayProbeSampling.depends('strategy', 'leastLoad');

    let xrayProbeHttpMethod = xSs.option(form.ListValue, 'probe_http_method', _('Probe HTTP Method'),
        _('Probe HTTP Method'));
    xrayProbeHttpMethod.value('', _('Default (HEAD)'));
    xrayProbeHttpMethod.value('HEAD', 'HEAD');
    xrayProbeHttpMethod.value('GET', 'GET');
    xrayProbeHttpMethod.depends('strategy', 'leastPing');
    xrayProbeHttpMethod.depends('strategy', 'leastLoad');
}

// 创建所有标签页
function createTabs(s: LuCI.form.AbstractSection) {
    s.tab('basic', _('Basic Configuration'));
    s.tab('config', _('Shunt Configuration Editor'));
    s.tab('route', _('Routing Configuration'));
    s.tab('dns', _('DNS Server Configuration'));
    s.tab('slb', _('Load Balancing'));
    s.tab('ruleset', _('Rule-set'));
}

function resetHash() {
    let data = ShuntUtils.getShuntConfData()
    if (data === "") {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'shunt_hash', -1)
        return false;
    }
    let currentHash = WebUtils.simpleHash(data)
    let oldHash = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'shunt_hash')
    if (currentHash !== oldHash) {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'shunt_hash', currentHash)
        return true;
    }
    return false;
}

function preview() {
    try {
        let configJson = ShuntUtils.getShuntConfData()
        let shuntType = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'type') || 'xray'
        // 创建模态对话框显示配置
        ui.showModal(_('Preview Configuration'), [
            E('div', { 'class': 'cbi-section' }, [
                E('div', { 'class': 'cbi-section-descr' },
                    _('Generated %s JSON Configuration').format(shuntType)),
                E('pre', {
                    'style': 'max-height: 500px; overflow: auto; padding: 10px; border-radius: 4px;',
                    'id': 'config-preview-content'
                }, configJson)
            ]),
            E('div', {
                'class': 'right',
                'style': 'display: flex; justify-content: flex-end; align-items: center; gap: 10px;'
            }, [
                E('button', {
                    'class': 'btn cbi-button',
                    'click': ui.hideModal
                }, _('关闭')),
                E('button', {
                    'class': 'btn cbi-button-action',
                    'click': function (ev) {
                        ev.preventDefault();
                        ev.stopPropagation();
                        // 复制配置到剪贴板
                        let content = document.getElementById('config-preview-content').textContent;
                        navigator.clipboard.writeText(content).then(function () {
                            WebUtils.showSuccessNotification("成功", "配置已复制到剪贴板", 3000);
                        })
                    }
                }, _('Copy Configuration'))
            ])
        ]);
    } catch (err) {
        console.log(err);
        WebUtils.showErrorNotification("配置生成失败", _(err.message), 5000);
    }
}

function shuntConfWrite(func: Function) {
    return function (section_id: string) {
        if (uci.get_first(LuciFlied.CONF_NAME,
            LuciFlied.SHUNT_SECTION_TYPE, 'config_type') === 'tmpl') {
            resetHash()
        } else {
            return func.call(this, section_id, "");
        }
    }
}

// 封装：动态加载代理节点选项（委托给 WebUtils）
function loadProxyNodeOptions(option: LuCI.form.AbstractValue, includeSLB: boolean) {
    WebUtils.loadProxyNodeOptions(option, includeSLB);
}


// 封装：动态加载DNS服务器选项
function loadDNSServerOptions(option: LuCI.form.AbstractValue, includeDefault: boolean) {
    option.load = function (section_id) {
        delete this.keylist;
        delete this.vallist;

        if (includeDefault) {
            this.value('', _('Use Global Default DNS'));
        }

        uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_DNS_NODE_TYPE, function (section: any) {
            if (section.tag) {
                let displayName = section.tag;
                if (section.server) {
                    displayName += ' (' + section.server + ')';
                }
                this.value(section.tag, displayName);
            }
        }.bind(this));

        return form.ListValue.prototype.load.apply(this, [section_id]);
    };
}

// 创建SectionValue容器
function createSectionContainer<T extends LuCI.form.AbstractSection>(s: LuCI.form.AbstractSection, tab: string, id: string,
    sectionType: T, sectionName: string, title: string) {
    let o = s.taboption(tab, form.SectionValue, id, sectionType, sectionName, title);
    o.depends({ config_type: "tmpl" });
    return o;
}

// 创建必填的ListValue
function createRequiredListValue(section: LuCI.form.AbstractSection,
    name: string, title: string, description: string,
    validator?: Function) {
    let o = section.option(form.ListValue, name, title, description);
    o.rmempty = false;
    if (validator) {
        o.validate = validator;
    }
    return o;
}


// 创建DynamicList并添加校验
function createValidatedDynamicList(section: LuCI.form.AbstractSection,
    name: string, title: string, description: string,
    sectionType: string, getItemName: (section: any) => any) {
    let o = section.option(form.DynamicList, name, title, description);

    // 动态加载选项
    o.load = function (section_id: any) {
        delete this.keylist;
        delete this.vallist;

        uci.sections(LuciFlied.CONF_NAME, sectionType, function (section: any) {
            let itemName = getItemName(section);
            if (itemName) {
                this.value(itemName.value, itemName.display);
            }
        }.bind(this));

        return form.DynamicList.prototype.load.apply(this, [section_id]);
    };

    // 校验输入值是否存在
    o.validate = function (section_id: string, value: string) {
        if (!value || value === '') {
            return true;
        }

        let availableItems = [];
        uci.sections(LuciFlied.CONF_NAME, sectionType, function (section) {
            let itemName = getItemName(section);
            if (itemName) {
                availableItems.push(itemName.value);
            }
        });

        if (availableItems.indexOf(value) === -1) {
            return _('Item Not Found').format(title, value);
        }

        return true;
    };

    return o;
}

export default v;
