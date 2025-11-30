'use strict';
'require view';
'require form';
'require ui';
'require fs';
'require uci';
'require view.hijpass.hijpass as hj';
'require view.hijpass.singbox as sb';
'require view.hijpass.xray as xr';

(function (){
    // 创建基础配置选项
    function createBasicOptions(s) {
        let o;
        // 分流类型
        o = s.taboption('basic', form.ListValue, 'type', _('分流类型'),
            _('选择分流程序类型'));
        hj.HijpassEnum.SHUNT_CONF_TYPE.forEach(function (type) {
            o.value(type);
        })
        o.default = 'xray';
        o.rmempty = false;

        o = s.taboption('basic', form.ListValue, 'config_type', _('配置类型'),
            _('选择配置类型'));
        o.value('tmpl', _('模板配置'));
        o.value('custom', _('自定义编辑'));
        o.rmempty = true;

        // 分流监听端口
        o = s.taboption('basic', form.Value, 'shunt_listen_port', _('分流监听端口'),
            _('指定分流监听端口号'));
        o.default = '1041';
        o.datatype = 'port';
        o.rmempty = false;

        // DNS监听端口
        o = s.taboption('basic', form.Value, 'dns_listen_port', _('DNS监听端口'),
            _('指定DNS监听端口号'));
        o.default = '10153';
        o.datatype = 'port';
        o.rmempty = false;

        // 日志路径
        o = s.taboption('basic', form.ListValue, 'log_level', _('日志等级'), _('日志记录等级'));
        hj.HijpassEnum.SING_BOX_LOG_LEVELS.forEach(function (level) {
            o.value(level, level);
        })
        o.rmempty = false;

        // 日志路径
        o = s.taboption('basic', form.Value, 'log_path', _('日志路径'),
            _('指定记录日志的具体路径'));
        o.default = '/tmp/log/hijpass-shunt.log';
        o.rmempty = false;

        // 预览配置按钮
        o = s.taboption('basic', form.Button, '_preview_config', _('预览配置'),
            _('点击预览生成的Sing-Box配置'));
        o.depends('config_type', 'tmpl');
        o.inputtitle = _('预览配置');
        o.inputstyle = 'apply';
        o.onclick = preview
    }


    function createConfigEditor(s) {
        let o = s.taboption('config', form.TextValue, 'shunt_hash', null, '修改分流配置文件');
        o.depends('config_type', 'custom')
        hj.WebUtils.setEditorOptionMembers(o, hj.WebUtils.getFilePath('shunt_conf'), 'shunt_hash');
        let defaultWrite = o.write
        o.write = shuntConfWrite(defaultWrite)
        o.remove = shuntConfWrite(defaultWrite)
        o.rmempty = false;
    }

// 创建路由配置选项
    function createRouteOptions(s) {
        // 默认全局路由出口配置
        let o = hj.WebUtils.createSectionContainer(s, 'route', '_route_global',
            form.TypedSection, hj.HijpassEnum.SHUNT_SECTION_TYPE, _('路由全局配置'));

        let ss = o.subsection;
        hj.WebUtils.setAnonymousSection(ss);

        o = hj.WebUtils.createRequiredListValue(ss, 'default_proxy_node', _('默认全局出口'),
            _('选择默认使用的出口节点，未命中的路由、rule-set更新会使用该出口'),
            function (section_id, value) {
                if (!value) {
                    return _('请先配置全局出口');
                }
                return true;
            });
        hj.WebUtils.loadProxyNodeOptions(o, 'slb-only');

        // 路由规则配置（合并了规则组和路由）
        o = s.taboption('route', form.SectionValue, '_route_rule',
            form.GridSection, hj.HijpassEnum.SHUNT_ROUTE_RULE_TYPE, _('路由规则配置'));
        o.depends({config_type: "tmpl"})

        ss = o.subsection;
        hj.WebUtils.setAnonymousGridSectionMembers(ss)
        ss.modaltitle = _('编辑路由规则');
        ss.sectiontitle = function (section_id) {
            return uci.get(hj.HijpassEnum.CONF_NAME, section_id, 'name') || _('未命名规则');
        };
        ss.tab('_rule', _('规则'));
        ss.tab('_dns', _('DNS配置'));

        // 规则名称
        o = ss.taboption('_rule', form.Value, 'name', _('规则名称'));
        o.validate = hj.WebUtils.createTagValidator(hj.HijpassEnum.SHUNT_ROUTE_RULE_TYPE, 'name')
        o.rmempty = false;
        o.modalonly = true;

        // 启用开关（从路由配置移过来）
        o = ss.taboption('_rule', form.Flag, 'enabled', _('启用'));
        o.default = '1';
        o.rmempty = false;
        o.editable = true;

        // 代理节点（动态生成选项）
        o = ss.taboption('_rule', form.ListValue, 'proxy_node', _('代理节点'));
        o.rmempty = false;
        o.editable = true;
        hj.WebUtils.loadProxyNodeOptions(o, true);  // 包含阻止和负载均衡

        // DNS服务器（动态生成选项）
        o = ss.taboption('_dns', form.ListValue, 'dns_node', _('DNS服务器'), _('仅在规则中存在域名、geosite、rule_set时生效'));
        o.modalonly = true;

        hj.WebUtils.loadDNSServerOptions(o, true);  // 包含默认选项

        o = ss.taboption('_dns', form.ListValue, 'dns_strategy', _('DNS策略'), _('4：只使用v4<br>'
            + '6：只使用v6<br>'
            + '46：优先v4（只在sing-box模式下生效，xray自动替换为双栈）<br>'
            + '64：优先v6（只在sing-box模式下生效，xray自动替换为双栈）<br>'));
        o.value('', _('使用全局默认解析策略'))
        hj.HijpassEnum.DNS_STRATEGY_VALUES.forEach(function (strategy) {
            o.value(strategy, strategy);
        });
        o.modalonly = true;

        o = ss.taboption('_dns', form.ListValue, 'dns_proxy_node', _('DNS出口节点'));
        o.value('', _('使用路由代理节点'));
        o.value('hijpass-direct', _('直连'));
        uci.sections(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.PROXY_NODE_TYPE, function (section) {
            if (section.name) {
                let displayName = section.name;
                if (section.socks_port) {
                    displayName += ' (' + section.socks_port + ')';
                }
                o.value(section.name, displayName);
            }
        });
        o.modalonly = true;

        // 网络
        o = ss.taboption('_rule', form.MultiValue, 'network', _('网络'));
        o.widget = "checkbox"
        o.value('tcp');
        o.value('udp');
        o.modalonly = true

        // 协议
        o = ss.taboption('_rule', form.MultiValue, 'protocol', _('协议'), _('当前xray仅支持http、tls、quic和bittorrent'));
        o.widget = "checkbox"
        o.value('tls');
        o.value('http');
        o.value('quic');
        o.value('stun');
        o.value('dns');
        o.value('bittorrent');
        o.value('dtls');
        o.value('ssh');
        o.value('rdp');
        o.value('ntp');
        o.modalonly = true

        // 端口
        o = ss.taboption('_rule', form.DynamicList, 'port', _('端口'));
        o.datatype = 'port';
        o.placeholder = '80';
        o.modalonly = true

        // 端口范围
        o = ss.taboption('_rule', form.DynamicList, 'port_range', _('端口范围'));
        o.datatype = 'portrange';
        o.placeholder = '1000-2000';
        o.modalonly = true

        // 域名规则列表
        o = ss.taboption('_rule', form.TextValue, 'domain_list', _('域名规则列表'), _('纯字符串: 当此字符串匹配目标域名中任意部分，该规则生效。<br>' +
            '正则表达式: 由\'regexp:\'开始，余下部分是一个正则表达式。<br>' +
            '子域名 (推荐): 由\'domain:\'开始，余下部分是一个域名。当此域名是目标域名或其子域名时，该规则生效。<br>' +
            '完整匹配: 由\'full:\'开始，余下部分是一个域名。当此域名完整匹配目标域名时，该规则生效。<br>' +
            'geosite: 形如\'geosite:cn\'。<br>' +
            'rule-set: 形如\'rule-set:local:/path/rulefile\'或\'rule-set:remote:https://file\'。<br>' +
            '注释: 由 # 开头'));
        o.rows = 4;
        o.monospace = true;
        o.modalonly = true

        // IP规则列表
        o = ss.taboption('_rule', form.TextValue, 'ip_list', _('IP规则列表'), _('IP: 形如\'127.0.0.1\'。<br>' +
            'CIDR: 形如\'10.0.0.0/8\'.<br>' +
            'geoip: 形如\'geoip:cn\'。<br>' +
            'rule-set: 形如\'rule-set:local:/path/rulefile\'或\'rule-set:remote:https://file\'。<br>' +
            '注释: 由 # 开头'));
        o.rows = 4;
        o.monospace = true;
        o.modalonly = true
    }


// 创建DNS服务器配置选项
    function createDNSOptions(s) {

        let o = hj.WebUtils.createSectionContainer(s, 'dns', '_dns_global',
            form.TypedSection, hj.HijpassEnum.SHUNT_SECTION_TYPE, _('DNS全局配置'));

        let ss = o.subsection;
        hj.WebUtils.setAnonymousSection(ss);

        // 默认全局DNS配置
        o = hj.WebUtils.createRequiredListValue(ss, 'default_dns_node', _('默认全局DNS'),
            _('选择默认使用的DNS服务器，未命中路由将使用此DNS'),
            function (section_id, value) {
                if (!value) {
                    return _('请先配置全局DNS服务器');
                }
                return true;
            });
        hj.WebUtils.loadDNSServerOptions(o, false);

        o = ss.option(form.ListValue, 'default_strategy', _('默认DNS解析策略'),
            _('4：只使用v4<br>'
                + '6：只使用v6<br>'
                + '46：优先v4（只在sing-box模式下生效，xray自动替换为双栈）<br>'
                + '64：优先v6（只在sing-box模式下生效，xray自动替换为双栈）<br>'));
        hj.HijpassEnum.DNS_STRATEGY_VALUES.forEach(function (strategy) {
            o.value(strategy, strategy);
        });
        o.rmempty = false;


        o = s.taboption('dns', form.SectionValue, '_dns_servers',
            form.GridSection, hj.HijpassEnum.SHUNT_DNS_NODE_TYPE, _('DNS节点配置'));
        o.depends({config_type: "tmpl"})

        ss = o.subsection;
        ss.anonymous = true;
        ss.addremove = true;
        ss.sortable = true;
        ss.nodescriptions = true;
        ss.modaltitle = _('编辑DNS服务器');
        ss.sectiontitle = function (section_id) {
            let tag = uci.get(hj.HijpassEnum.CONF_NAME, section_id, 'tag') || _('未命名');
            return tag;
        };

        // DNS类型
        o = ss.option(form.ListValue, 'type', _('类型'),
            _('DNS服务器类型'));
        o.value('tcp', 'TCP');
        o.value('udp', 'UDP');
        o.value('tls', 'TLS');
        o.value('https', 'HTTPS');
        o.value('quic', 'QUIC');
        o.default = 'tcp';
        o.rmempty = false;

        // DNS标签
        o = ss.option(form.Value, 'tag', _('标签'),
            _('DNS服务器的唯一标识'));
        o.placeholder = 'dns-local';
        o.rmempty = false;
        o.validate = hj.WebUtils.createTagValidator(hj.HijpassEnum.SHUNT_DNS_NODE_TYPE, 'tag')
        o.modalonly = true

        // DNS服务器地址
        o = ss.option(form.Value, 'server', _('服务器'),
            _('DNS服务器地址'));
        o.placeholder = '8.8.8.8';
        o.datatype = 'ipaddr';
        o.rmempty = false;

        // DNS服务器端口
        o = ss.option(form.Value, 'port', _('端口'),
            _('DNS服务器端口'));
        o.placeholder = '53';
        o.datatype = 'port';
        o.rmempty = true;
    }

// 创建负载均衡选项
    function createSLBOptions(s) {
        let o = s.taboption('slb', form.SectionValue, '_slb_global',
            form.TypedSection, hj.HijpassEnum.SHUNT_SECTION_TYPE, _('负载均衡配置'));
        o.depends({config_type: "tmpl"})
        let ss = o.subsection;
        ss.anonymous = true;
        ss.addremove = false;

        o = hj.WebUtils.createValidatedDynamicList(ss, 'lb_node_list', _('负载均衡'),
            _('根据所选节点健康度自动调整出口路由，配置后可在代理节点处选择负载均衡节点'),
            function () {
                return hj.HijpassEnum.PROXY_NODE_TYPE;
            },
            function (section) {
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

        o = ss.option(form.Value, 'url', _('测试URL'),
            _('输入一个测试的URL地址，默认使用 https://www.gstatic.com/generate_204'));
        o.depends({lb_node_list: /^\s*\S.*$/})

        o = ss.option(form.Value, 'interval', _('测试间隔'),
            _('设置测试的间隔时间，默认3m'));
        o.depends({lb_node_list: /^\s*\S.*$/})

        o = ss.option(form.Value, 'timeout', _('测试超时'),
            _('设置测试的超时时间，默认2s'));
        o.depends({lb_node_list: /^\s*\S.*$/})
    }

// 创建所有标签页
    function createTabs(s) {
        s.tab('basic', _('基础配置'));
        s.tab('config', _('分流配置编辑'));
        s.tab('route', _('路由配置'));
        s.tab('dns', _('DNS服务器配置'));
        s.tab('slb', _('负载均衡'));
        s.tab('ruleset', _('规则集'));
    }

    function getShuntConfData() {
        let data = "";
        if (uci.get_first(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.SHUNT_SECTION_TYPE, 'config_type') === 'tmpl') {
            if (uci.get_first(hj.HijpassEnum.CONF_NAME,
                hj.HijpassEnum.SHUNT_SECTION_TYPE, 'type') === "sing-box") {
                data = JSON.stringify(sb.genConf(), null, 2)
            }
            if (uci.get_first(hj.HijpassEnum.CONF_NAME,
                hj.HijpassEnum.SHUNT_SECTION_TYPE, 'type') === "xray") {
                data = JSON.stringify(xr.genXrayConf(), null, 2)
            }
        }
        return data;
    }

    function resetHash() {
        let data = getShuntConfData()
        if (data === "") {
            uci.set_first(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.SHUNT_SECTION_TYPE, 'shunt_hash', -1)
            return false;
        }
        let currentHash = hj.WebUtils.simpleHash(data)
        let oldHash = uci.get_first(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.SHUNT_SECTION_TYPE, 'shunt_hash')
        if (currentHash !== oldHash) {
            uci.set_first(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.SHUNT_SECTION_TYPE, 'shunt_hash', currentHash)
            return true;
        }
        return false;
    }

    function preview() {
        try {
            let configJson = getShuntConfData()
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
                                alert(_('配置已复制到剪贴板'));
                            })
                        }
                    }, _('复制配置'))
                ])
            ]);
        } catch (err) {
            alert(_('生成配置失败：') + err.message);
            console.error('Config generation error:', err);
        }
    }

    function shuntConfWrite(func) {
        return function (section_id) {
            if (uci.get_first(hj.HijpassEnum.CONF_NAME,
                hj.HijpassEnum.SHUNT_SECTION_TYPE, 'config_type') === 'tmpl') {
                resetHash()
            } else {
                return func.call(this, section_id, "");
            }
        }
    }

    return view.extend({
        load: function () {
            return Promise.all([
                uci.load(hj.HijpassEnum.CONF_NAME)
            ]);
        },

        handleSaveApply: function () {
            view.prototype.handleSave.call(this);
            if (uci.get_first(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.SHUNT_SECTION_TYPE, 'config_type') === 'tmpl') {
                fs.write(hj.WebUtils.getFilePath('shunt_conf'), getShuntConfData());
            }
            ui.changes.apply(true);
        },

        render: function () {
            let m, s;

            m = new form.Map(hj.HijpassEnum.CONF_NAME, _('分流设置'),
                _('配置分流规则和设置'));

            s = m.section(form.TypedSection, hj.HijpassEnum.SHUNT_SECTION_TYPE);
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
})();