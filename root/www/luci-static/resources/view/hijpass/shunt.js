'use strict';
'require view';
'require form';
'require ui';
'require fs';
'require uci';
'require view.hijpass.hijpass as hj'
'require view.hijpass.singbox as sb'

const XRAY_STRATEGY_VALUES = ['UseIP', 'UseIPv4', 'UseIPv6', 'UseSystem']
const SING_BOX_STRATEGY_VALUES = ['prefer_ipv4', 'prefer_ipv6', 'ipv4_only', 'ipv6_only']

return view.extend({
    load: function () {
        return Promise.all([
            uci.load(hj.CONF_NAME)
        ]);
    },
    handleSaveApply: function () {
        this.handleSave();
        if (uci.get_first(hj.CONF_NAME, hj.SHUNT_SECTION_TYPE, 'config_type') === 'tmpl') {
            let data = JSON.stringify(sb.genConf(), null, 4)
            let currentHash = hj.simpleHash(data)
            let oldHash = uci.get_first(hj.CONF_NAME, hj.SHUNT_SECTION_TYPE, 'shunt_hash')
            if (oldHash === currentHash) {
                return
            }
            uci.set(hj.CONF_NAME, hj.SHUNT_SECTION_TYPE, 'shunt_hash', currentHash)
            fs.write(hj.getFilePath('shunt_conf'), data);
        }
        ui.changes.apply(true);
    },

    render: function () {
        let m, s;

        m = new form.Map(hj.CONF_NAME, _('分流设置'),
            _('配置分流规则和设置'));

        s = m.section(form.TypedSection, hj.SHUNT_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;
        // 创建标签页
        createTabs(s);

        // 创建基础配置选项
        createBasicOptions(s);
        createConfigEditor(s);
        createRouteOptions(s);
        createDNSOptions(s);
        createCondGroupOptions(s);
        return m.render();
    }
});

// 创建基础配置选项
function createBasicOptions(s) {
    let o;

    // 分流类型
    o = s.taboption('basic', form.ListValue, 'type', _('分流类型'),
        _('选择分流程序类型'));
    o.value('xray');
    o.value('sing-box');
    o.default = 'xray';
    o.rmempty = false;

    o = s.taboption('basic', form.ListValue, 'config_type', _('配置类型'),
        _('选择配置类型'));
    o.value('tmpl', _('模板配置'));
    o.value('custom', _('自定义编辑'));
    o.depends('type', 'sing-box')
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
    o.onclick = function () {
        try {
            let config = sb.genConf();
            let configJson = JSON.stringify(config, null, 2);

            // 创建模态对话框显示配置
            let modal = ui.showModal(_('Sing-Box 配置预览'), [
                E('div', { 'class': 'cbi-section' }, [
                    E('div', { 'class': 'cbi-section-descr' },
                        _('以下是根据当前配置生成的Sing-Box JSON配置：')),
                    E('pre', {
                        'style': 'max-height: 500px; overflow: auto; background: #f5f5f5; padding: 10px; border-radius: 4px;'
                    }, configJson)
                ]),
                E('div', { 'class': 'right' }, [
                    E('button', {
                        'class': 'btn cbi-button-positive',
                        'click': ui.hideModal
                    }, _('关闭'))
                ])
            ]);
        } catch (err) {
            ui.addNotification(null, E('p', _('生成配置失败：') + err.message), 'error');
            console.error('Config generation error:', err);
        }
    };
}


function createConfigEditor(s) {
    let o = s.taboption('config', form.TextValue, 'shunt_hash', null, '修改分流配置文件');
    o.depends('config_type', 'custom')
    o.depends('type', 'xray')
    hj.setEditorOptionMembers(o, hj.getFilePath('shunt_conf'), 'shunt_hash');
}

// 创建路由配置选项
function createRouteOptions(s) {
    // 自动同步规则组到路由配置
    syncRulesToRoutes();

    // 默认全局路由出口配置
    let o = s.taboption('route', form.ListValue, 'default_outbound', _('默认全局出口'),
        _('选择默认使用的出口节点，同全局默认dns搭配使用'));
    o.depends('config_type', 'tmpl')
    o.value('hijpass-direct', _('直连'));
    uci.sections(hj.CONF_NAME, hj.PROXY_NODE_TYPE, function (section) {
        if (section.name) {
            let displayName = section.name;
            if (section.socks_port) {
                displayName += ' (' + section.socks_port + ')';
            }
            o.value(section.name, displayName);
        }
    });
    o.default = '';
    o.rmempty = false;

    o = s.taboption('route', form.SectionValue, '_route_config', form.TableSection, 'shunt_route');
    o.depends('config_type', 'tmpl')

    let ss = o.subsection;
    ss.anonymous = true;
    ss.addremove = false;  // 不允许手动添加删除
    ss.sortable = true;

    // 启用开关
    o = ss.option(form.Flag, 'enabled', _('启用'));
    o.default = '1';  // 默认启用
    o.editable = true;
    o.rmempty = false;


    // 规则名称（只读显示）
    o = ss.option(form.DummyValue, 'rule_name', _('规则组'));
    o.cfgvalue = function (section_id) {
        return uci.get(hj.CONF_NAME, section_id, 'rule_name') || _('未命名');
    };

    // 代理节点
    o = ss.option(form.ListValue, 'proxy_node', _('代理节点'));
    o.rmempty = false;

    // 添加特殊选项
    o.value('hijpass-direct', _('直连'));
    o.value('hijpass-block', _('阻止'));

    // 动态添加代理节点选项
    uci.sections(hj.CONF_NAME, hj.PROXY_NODE_TYPE, function (section) {
        if (section.name) {
            let displayName = section.name;
            if (section.socks_port) {
                displayName += ' (' + section.socks_port + ')';
            }
            o.value(section.name, displayName);
        }
    });

    o.validate = function (section_id, value) {
        if (!value || value.trim() === '') {
            return _('请选择代理节点');
        }
        return true;
    };

    // DNS服务器
    o = ss.option(form.ListValue, 'dns_server', _('DNS服务器'));
    o.optional = false;

    // 动态添加DNS服务器选项
    uci.sections(hj.CONF_NAME, 'shunt_dns_server', function (section) {
        if (section.tag) {
            let displayName = section.tag;
            if (section.server) {
                displayName += ' (' + section.server + ')';
            }
            o.value(section.tag, displayName);
        }
    });

    // 备注
    o = ss.option(form.Value, 'remark', _('备注'));
    o.optional = true;
    o.placeholder = _('例如：国内流量直连');
}

// 同步规则组到路由配置
function syncRulesToRoutes() {
    let existingRoutes = {};
    uci.sections(hj.CONF_NAME, 'shunt_route', function (section) {
        let ruleName = section.rule_name;
        if (ruleName) {
            existingRoutes[ruleName] = section['.name'];
        }
    });

    // 收集所有规则组
    uci.sections(hj.CONF_NAME, 'shunt_rules_group', function (section) {
        let name = section.name;
        if (name) {

            // 如果规则组没有对应的路由，创建一个
            if (!existingRoutes[name]) {
                let sid = uci.add(hj.CONF_NAME, 'shunt_route');
                uci.set(hj.CONF_NAME, sid, 'rule_name', name);
                uci.set(hj.CONF_NAME, sid, 'enabled', '1');
                uci.set(hj.CONF_NAME, sid, 'proxy_node', 'hijpass-direct');
                uci.set(hj.CONF_NAME, sid, 'dns_server', 'hijpass-direct');
            }
        }
    });
}

// 创建DNS服务器配置选项
function createDNSOptions(s) {
    let o;

    // 默认全局DNS配置
    o = s.taboption('dns', form.ListValue, 'default_dns', _('默认全局DNS'),
        _('选择默认使用的DNS服务器，未名中路由将使用此DNS'));
    o.depends('config_type', 'tmpl')
    // 动态添加DNS服务器选项
    uci.sections(hj.CONF_NAME, 'shunt_dns_server', function (section) {
        if (section.tag) {
            let displayName = section.tag;
            if (section.server) {
                displayName += ' (' + section.server + ')';
            }
            o.value(section.tag, displayName);
        }
    });
    o.default = '';
    o.rmempty = false;

    o = s.taboption('dns', form.SectionValue, '_dns_servers', form.GridSection, 'shunt_dns_server');
    o.depends('config_type', 'tmpl')

    let ss = o.subsection;
    ss.anonymous = true;
    ss.addremove = true;
    ss.sortable = true;
    ss.nodescriptions = true;
    ss.modaltitle = _('编辑DNS服务器');
    ss.sectiontitle = function (section_id) {
        let tag = uci.get(hj.CONF_NAME, section_id, 'tag') || _('未命名');
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
    o.validate = function (section_id, value) {
        // 验证名称格式
        let formatResult = hj.validateNameFormat(section_id, value);
        if (formatResult !== true) {
            return formatResult;
        }

        // 验证标签是否重复
        let duplicate = false;
        uci.sections(hj.CONF_NAME, 'shunt_dns_server', function (section) {
            if (section['.name'] !== section_id && section.tag === value) {
                duplicate = true;
            }
        });

        if (duplicate) {
            return _('DNS标签已存在，请使用其他标签');
        }

        return true;
    };
    o.modalonly = true

    // DNS服务器地址
    o = ss.option(form.Value, 'server', _('服务器'),
        _('DNS服务器地址'));
    o.placeholder = '8.8.8.8';
    o.datatype = 'ipaddr';
    o.rmempty = false;
}

function createCondGroupOptions(s) {
    let o = s.taboption('rules', form.SectionValue, '_rules_group', form.GridSection, 'shunt_rules_group');
    o.depends('config_type', 'tmpl')
    let ss = o.subsection;
    ss.anonymous = true;
    ss.addremove = true;
    ss.sortable = true;
    ss.nodescriptions = true;
    ss.rowcolors = true;
    ss.modaltitle = _('编辑规则组');
    ss.sectiontitle = function (section_id) {
        return uci.get(hj.CONF_NAME, section_id, 'name') || _('未命名规则组');
    };

    // 删除规则组时，同时删除对应的路由配置
    ss.handleRemove = function (section_id) {
        // 先删除对应的路由配置
        let ruleName = uci.get(hj.CONF_NAME, section_id, 'name');
        if (ruleName) {
            uci.sections(hj.CONF_NAME, 'shunt_route', function (section) {
                if (section.rule_name === ruleName) {
                    uci.remove(hj.CONF_NAME, section['.name']);
                }
            });
        }
        return form.GridSection.prototype.handleRemove.apply(this, [section_id]);
    };

    o = ss.option(form.Value, 'name', _('规则名称'),
        _('修改规则的名称'));
    o.modalonly = true;
    o.validate = function (section_id, value) {
        // 验证名称格式
        let formatResult = hj.validateNameFormat(section_id, value);
        if (formatResult !== true) {
            return formatResult;
        }

        // 验证名称是否重复
        let duplicate = false;
        uci.sections(hj.CONF_NAME, 'shunt_rules_group', function (section) {
            if (section['.name'] !== section_id && section.name === value) {
                duplicate = true;
            }
        });

        if (duplicate) {
            return _('规则名称已存在，请使用其他名称');
        }

        return true;
    };
    o.rmempty = false;
    o.write = function (section_id, value) {
        let sid = uci.add(hj.CONF_NAME, 'shunt_route');
        uci.set(hj.CONF_NAME, sid, 'rule_name', value);
        uci.set(hj.CONF_NAME, sid, 'enabled', '1');
        uci.set(hj.CONF_NAME, section_id, 'name', value);
    };

    o = ss.option(form.Value, 'remark', _('备注'));
    o.optional = true;
    o.placeholder = _('例如：国内流量直连');

    o = ss.option(form.MultiValue, 'network', _('网络'));
    o.widget = "checkbox"
    o.value('tcp');
    o.value('udp');
    o.modalonly = true

    // 协议
    o = ss.option(form.MultiValue, 'protocol', _('协议'));
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


    // 端口范围
    o = ss.option(form.DynamicList, 'port', _('端口'));
    o.datatype = 'port';
    o.placeholder = '80';
    o.modalonly = true


    // 端口范围
    o = ss.option(form.DynamicList, 'port_range', _('端口范围'));
    o.datatype = 'portrange';
    o.placeholder = '1000-2000';
    o.modalonly = true


    o = ss.option(form.TextValue, 'domain_list', _('域名规则列表'), _('纯字符串: 当此字符串匹配目标域名中任意部分，该规则生效。<br>' +
        '正则表达式: 由\'regexp:\'开始，余下部分是一个正则表达式。<br>' +
        '子域名 (推荐): 由\'domain:\'开始，余下部分是一个域名。当此域名是目标域名或其子域名时，该规则生效。<br>' +
        '完整匹配: 由\'full:\'开始，余下部分是一个域名。当此域名完整匹配目标域名时，该规则生效。<br>' +
        'Sing-Box 规则集： 由 \'rule-set:remote:\' 或 \'rule-set:local:\' 开始<br>' +
        '例如：\'rule-set:remote:https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs\'<br>' +
        '例如：\'rule-set:local:/usr/share/sing-box/geosite-cn.srs\'<br>' +
        '注释: 由 # 开头'));
    o.rows = 4;
    o.monospace = true;
    o.modalonly = true


    o = ss.option(form.TextValue, 'ip_list', _('IP规则列表'), _('IP: 形如\'127.0.0.1\'。<br>' +
        'CIDR: 形如\'10.0.0.0/8\'.<br>' +
        'Sing-Box 规则集： 由 \'rule-set:remote:\' 或 \'rule-set:local:\' 开始<br>' +
        '例如：\'rule-set:remote:https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs\'<br>' +
        '例如：\'rule-set:local:/usr/share/sing-box/geoip-cn.srs\'<br>' +
        '注释: 由 # 开头'));
    o.rows = 4;
    o.monospace = true;
    o.modalonly = true

}

// 创建所有标签页
function createTabs(s) {
    s.tab('basic', _('基础配置'));
    s.tab('config', _('分流配置编辑'));
    s.tab('route', _('路由配置'));
    s.tab('dns', _('DNS服务器配置'));
    s.tab('rules', _('分流规则配置'));
}
