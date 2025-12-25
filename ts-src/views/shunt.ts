import {LuciUtils, ShuntUtils, WebUtils} from "../utils/common";

import {HijpassValues, LuciFlied, ShuntTag} from "../enum/hijpass";
import ui from 'ui';
import form from "form";
import view from 'view';
import uci from 'uci';

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
            WebUtils.showErrorNotification(_('配置保存失败'), _(e.message), 5000);
        }
    },

    handleSaveApply: LuciUtils.genHandleSaveApply(),

    render: function () {
        let m = new form.Map(LuciFlied.CONF_NAME, _('分流设置'),
            _('配置分流规则和设置'));
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
    // 分流类型
    let serviceType = s.taboption('basic', form.ListValue, 'type', _('分流类型'),
        _('选择分流程序类型'));
    HijpassValues.SHUNT_CONF_TYPE.forEach(function (type) {
        serviceType.value(type);
    })
    serviceType.default = 'xray';
    serviceType.rmempty = false;

    let configType = s.taboption('basic', form.ListValue, 'config_type', _('配置类型'),
        _('选择配置类型'));
    configType.value('tmpl', _('模板配置'));
    configType.value('custom', _('自定义编辑'));
    configType.rmempty = true;

    // 分流监听端口
    let shuntListenPort = s.taboption('basic', form.Value, 'shunt_listen_port', _('分流监听端口'),
        _('指定分流监听端口号'));
    shuntListenPort.default = '1041';
    shuntListenPort.datatype = 'port';
    shuntListenPort.rmempty = false;

    // DNS监听端口
    let dnsListenPort = s.taboption('basic', form.Value, 'dns_listen_port', _('DNS监听端口'),
        _('指定DNS监听端口号'));
    dnsListenPort.default = '10153';
    dnsListenPort.datatype = 'port';
    dnsListenPort.rmempty = false;

    // 日志开关
    WebUtils.createLogFlagOption(s, LuciFlied.CONF_NAME, 'basic');

    // 日志路径
    let logLevel = s.taboption('basic', form.ListValue, 'log_level', _('日志等级'), _('日志记录等级'));
    HijpassValues.SHUNT_LOG_LEVELS.forEach(function (level) {
        logLevel.value(level);
    })
    logLevel.depends('log_enabled','1');

    // 预览配置按钮
    let previewConfigButton = s.taboption('basic', form.Button, '_preview_config', _('预览配置'),
        _('点击预览配置'));
    previewConfigButton.depends('config_type', 'tmpl');
    previewConfigButton.inputtitle = _('预览配置');
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

    let defaultProxyNode = createRequiredListValue(routeTypeSection, 'default_proxy_node', _('默认全局出口'),
        _('选择默认使用的出口节点，未命中的路由会使用该出口'),
        function (section_id: any, value: any) {
            if (!value) {
                return _('请先配置全局出口');
            }
            return true;
        });
    loadProxyNodeOptions(defaultProxyNode, true);

    let rulesetOutNode = routeTypeSection.option(form.ListValue, 'ruleset_out_node', _('规则集出口'),
        _('rule-set下载使用出口（sing-box配置）'));
    loadProxyNodeOptions(rulesetOutNode, false);

    let rulesetConvert = routeTypeSection.option(form.Flag, 'ruleset_convert',
        _('使用geosite规则集'), _('通过geoview将geo规则转换为规则集（sing-box配置）'));
    rulesetConvert.rmempty = false;
    // 路由规则配置
    let routeGridSectionValue = s.taboption('route', form.SectionValue, '_route_rule',
        form.GridSection, LuciFlied.SHUNT_ROUTE_RULE_TYPE, _('路由规则配置'));
    routeGridSectionValue.depends({config_type: "tmpl"})

    let routeGridSection = routeGridSectionValue.subsection;
    routeGridSection.rowcolors = true
    WebUtils.setAnonymousGridSectionMembers(routeGridSection)
    routeGridSection.modaltitle = _('编辑路由规则');
    routeGridSection.sectiontitle = function (section_id: any) {
        return uci.get(LuciFlied.CONF_NAME, section_id, 'name') || _('未命名规则');
    };
    routeGridSection.rowcolors = true
    routeGridSection.tab('_rule', _('规则'));
    routeGridSection.tab('_dns', _('DNS配置'));

    // 规则名称
    let name = routeGridSection.taboption('_rule', form.Value, 'name', _('规则名称'));
    name.validate = WebUtils.createTagValidator(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, 'name')
    name.rmempty = false;
    name.modalonly = true;

    // 启用开关（从路由配置移过来）
    let enabled = routeGridSection.taboption('_rule', form.Flag, 'enabled', _('启用'));
    enabled.default = '1';
    enabled.rmempty = false;
    enabled.editable = true;

    // 代理节点（动态生成选项）
    let proxyNode = routeGridSection.taboption('_rule', form.ListValue, 'proxy_node', _('代理节点'));
    proxyNode.rmempty = false;
    proxyNode.editable = true;
    loadProxyNodeOptions(proxyNode, true);  // 包含阻止和负载均衡

    // DNS服务器（动态生成选项）
    let dnsNode = routeGridSection.taboption('_dns', form.ListValue, 'dns_node', _('DNS服务器'), _('仅在规则中存在域名、geosite、rule_set时生效'));
    // dnsNode.modalonly = true;
    loadDNSServerOptions(dnsNode, true);  // 包含默认选项
    dnsNode.cfgvalue = function (sectionId) {
        let dnsNode = uci.get(LuciFlied.CONF_NAME, sectionId, 'dns_node');
        if (dnsNode) {
            return dnsNode;
        }
        return _('-');
    }

    let dnsStrategy = routeGridSection.taboption('_dns', form.ListValue, 'dns_strategy', _('DNS解析策略'));
    dnsStrategy.value('', _('使用全局默认解析策略'))
    HijpassValues.DNS_STRATEGY_VALUES.forEach(function (strategy) {
        dnsStrategy.value(strategy.value, strategy.label);
    });
    dnsStrategy.modalonly = true;

    let dnsProxyNode = routeGridSection.taboption('_dns', form.ListValue, 'dns_proxy_node', _('DNS出口节点'));
    dnsProxyNode.value('', _('使用路由代理节点'));
    dnsProxyNode.value('hijpass-direct', _('直连'));
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section) {
        if (section.name) {
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
    let port = routeGridSection.taboption('_rule', form.DynamicList, 'port', _('端口'));
    port.datatype = 'port';
    port.placeholder = '80';
    port.modalonly = true

    // 端口范围
    let portRange = routeGridSection.taboption('_rule', form.DynamicList, 'port_range', _('端口范围'));
    portRange.datatype = 'portrange';
    portRange.placeholder = '1000-2000';
    portRange.modalonly = true

    let portView = routeGridSection.option(form.TextValue, '_port_view', _('端口范围'))
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
    let domainList = routeGridSection.taboption('_rule', form.TextValue, 'domain_list', _('域名规则列表'), _('纯字符串: 当此字符串匹配目标域名中任意部分，该规则生效。<br>' +
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
    let ipList = routeGridSection.taboption('_rule', form.TextValue, 'ip_list', _('IP规则列表'), _('IP: 形如\'127.0.0.1\'。<br>' +
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
    let defaultDNSNode = createRequiredListValue(dnsTypeSection, 'default_dns_node', _('默认全局DNS'),
        _('选择默认使用的DNS服务器，未命中路由将使用此DNS'),
        function (section_id: string, value: any) {
            if (!value) {
                return _('请先配置全局DNS服务器');
            }
            return true;
        });
    loadDNSServerOptions(defaultDNSNode, false);

    let rulesetDNSNode = dnsTypeSection.option(form.ListValue, 'ruleset_dns_node',
        _('规则集DNS'), _('选择用于解析rule-set链接域名的DNS服务器（sing-box配置）'));
    loadDNSServerOptions(rulesetDNSNode, false);

    let defaultStrategy = dnsTypeSection.option(form.ListValue, 'default_strategy', _('默认解析策略'));
    HijpassValues.DNS_STRATEGY_VALUES.forEach(function (strategy) {
        defaultStrategy.value(strategy.value, strategy.label);
    });
    defaultStrategy.rmempty = false;

    let useCache = dnsTypeSection.option(form.Flag, 'use_cache', _('DNS缓存'));
    useCache.rmempty = false;

    let dnsGridSectionValue = s.taboption('dns', form.SectionValue, '_dns_servers',
        form.GridSection, LuciFlied.SHUNT_DNS_NODE_TYPE, _('DNS节点配置'));
    dnsGridSectionValue.depends({config_type: "tmpl"})

    let dnsGridSection = dnsGridSectionValue.subsection;
    dnsGridSection.rowcolors = true
    dnsGridSection.anonymous = true;
    dnsGridSection.addremove = true;
    dnsGridSection.sortable = true;
    dnsGridSection.nodescriptions = true;
    dnsGridSection.modaltitle = _('编辑DNS服务器');
    dnsGridSection.sectiontitle = function (section_id) {
        return uci.get(LuciFlied.CONF_NAME, section_id, 'tag') || _('未命名');
    };

    // DNS类型
    let type = dnsGridSection.option(form.ListValue, 'type', _('类型'),
        _('DNS服务器类型'));
    type.value('tcp', 'TCP');
    type.value('udp', 'UDP');
    type.value('tls', 'TLS（仅sing-box支持）');
    type.value('https', 'HTTPS');
    type.value('quic', 'QUIC');
    type.default = 'tcp';
    type.rmempty = false;

    // DNS标签
    let tag = dnsGridSection.option(form.Value, 'tag', _('标签'),
        _('DNS服务器的唯一标识'));
    tag.placeholder = 'dns-local';
    tag.rmempty = false;
    tag.validate = WebUtils.createTagValidator(LuciFlied.CONF_NAME, LuciFlied.SHUNT_DNS_NODE_TYPE, 'tag')
    tag.modalonly = true

    // DNS服务器地址
    let server = dnsGridSection.option(form.Value, 'server', _('服务器'),
        _('DNS服务器地址'));
    server.placeholder = '8.8.8.8';
    server.datatype = 'ipaddr';
    server.rmempty = false;

    // DNS服务器端口
    let port = dnsGridSection.option(form.Value, 'port', _('端口'),
        _('DNS服务器端口'));
    port.placeholder = '53';
    port.datatype = 'port';
    port.rmempty = true;
}

// 创建负载均衡选项
function createSLBOptions(s: LuCI.form.AbstractSection) {
    let o = createSectionContainer(s, 'slb', '_slb_global',
        form.TypedSection, LuciFlied.SHUNT_SECTION_TYPE, _(''))
    let ss = o.subsection;
    ss.anonymous = true;
    ss.addremove = false;

    createValidatedDynamicList(ss, 'lb_node_list', _('负载均衡'),
        _('根据所选节点健康度自动调整出口路由，配置后可在代理节点处选择负载均衡节点'),
        LuciFlied.PROXY_NODE_TYPE,
        function (section: any) {
            if (section.name) {
                let displayName = section.name;
                if (section.socks_port) {
                    displayName += ' (' + section.socks_port + ')';
                }
                return {
                    value: section.name,
                    display: displayName
                };
            }
            return null;
        });

    let testUrl = ss.option(form.Value, 'url', _('测试URL'),
        _('输入一个测试的URL地址，默认使用 https://www.gstatic.com/generate_204'));
    testUrl.depends({lb_node_list: /^\s*\S.*$/})

    let testInterval = ss.option(form.Value, 'interval', _('测试间隔'),
        _('设置测试的间隔时间，默认3m'));
    testInterval.depends({lb_node_list: /^\s*\S.*$/})

    let testTimeout = ss.option(form.Value, 'timeout', _('测试超时'),
        _('设置测试的超时时间，默认2s'));
    testTimeout.depends({lb_node_list: /^\s*\S.*$/})
}

// 创建所有标签页
function createTabs(s: LuCI.form.AbstractSection) {
    s.tab('basic', _('基础配置'));
    s.tab('config', _('分流配置编辑'));
    s.tab('route', _('路由配置'));
    s.tab('dns', _('DNS服务器配置'));
    s.tab('slb', _('负载均衡'));
    s.tab('ruleset', _('规则集'));
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
        // 创建模态对话框显示配置
        ui.showModal(_('Sing-Box 配置预览'), [
            E('div', {'class': 'cbi-section'}, [
                E('div', {'class': 'cbi-section-descr'},
                    _('以下是根据当前配置生成的Sing-Box JSON配置：')),
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
                }, _('复制配置'))
            ])
        ]);
    } catch (err) {
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

// 封装：动态加载代理节点选项
function loadProxyNodeOptions(option: LuCI.form.AbstractValue, includeSLB: boolean) {
    option.load = function (section_id) {
        delete this.keylist;
        delete this.vallist;

        this.value(ShuntTag.DIRECT_OUTBOUND_TAG, _('直连'));
        if (includeSLB !== false) {
            this.value(ShuntTag.BLOCK_OUTBOUND_TAG, _('阻止'));
        }

        uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section: any) {
            if (section.name) {
                let displayName = section.name;
                if (section.socks_port) {
                    displayName += ' (' + section.socks_port + ')';
                }
                this.value(section.name, displayName);
            }
        }.bind(this));

        if (includeSLB !== false) {
            let slbOutbounds = uci.get_first(
                LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'lb_node_list');
            if (slbOutbounds && slbOutbounds.length > 0) {
                this.value(ShuntTag.LOAD_BALANCE_OUTBOUND_TAG, _('负载均衡'));
            }
        }

        return form.ListValue.prototype.load.apply(this, [section_id]);
    };
}


// 封装：动态加载DNS服务器选项
function loadDNSServerOptions(option: LuCI.form.AbstractValue, includeDefault: boolean) {
    option.load = function (section_id) {
        delete this.keylist;
        delete this.vallist;

        if (includeDefault) {
            this.value('', _('使用全局默认DNS'));
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
    o.depends({config_type: "tmpl"});
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
            return _('%s "%s" 不存在，请从下拉列表中选择或先在配置中添加').format(title, value);
        }

        return true;
    };

    return o;
}

export default v;
