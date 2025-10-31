'use strict';
'require view';
'require form';
'require ui';
'require uci';
'require fs'
'require view.hijpass.hijpass as hj';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load(hj.CONF_NAME)
        ]);
    },

    render: function () {
        var m, s, o;

        m = new form.Map(hj.CONF_NAME, _('DNS分流设置'), _('配置DNS分流相关设置'));

        s = m.section(form.TypedSection, hj.DNS_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;

        s.tab('basic', _('基本设置'));
        s.tab('domain_direct', _('域名直连列表'));
        s.tab('domain_proxy', _('域名代理列表'));


        // === DNS分流配置 ===

        o = s.taboption('basic', form.ListValue, 'dns_service', _('分流服务'),
            _('选择DNS分流服务类型'));
        o.value('dnsmasq', 'dnsmasq');
        o.value('chinadns-ng', 'chinadns-ng');
        o.value('custom', _('自定义'));
        o.default = 'dnsmasq';
        o.rmempty = false;

        o = s.taboption('basic', form.Value, 'cdg_port', _('监听端口'),
            _('指定ChinaDNS-NG的监听端口'));
        o.depends('dns_service', 'chinadns-ng');
        o.default = '53653';
        o.type="port"
        o.rmempty = false;

        o = s.taboption('basic', form.ListValue, 'direct_dns', _('直连域名DNS'),
            _('选择直连域名使用的DNS服务器'));
        o.depends('dns_service', 'dnsmasq');
        o.depends('dns_service', 'chinadns-ng');
        o.value('system', _('使用系统DNS'));
        o.value('custom', _('自定义DNS'));
        o.default = 'system';
        o.rmempty = false;

        o = s.taboption('basic', form.Value, 'direct_dns_custom', _('自定义直连DNS'),
            _('指定直连域名使用的DNS服务器'));
        o.depends('direct_dns', 'custom');
        o.default = '223.5.5.5#53';
        o.rmempty = false;

        o = s.taboption('basic', form.ListValue, 'proxy_dns', _('代理域名DNS'),
            _('选择代理域名使用的DNS服务器'));
        o.depends('dns_service', 'dnsmasq');
        o.depends('dns_service', 'chinadns-ng');

        // 动态添加分流DNS监听端口选项
        var shuntSections = uci.sections('hijpass', 'shunt');
        var defaultDnsPort = null;
        if (shuntSections && shuntSections.length > 0) {
            shuntSections.forEach(function (shuntSection) {
                if (shuntSection.dns_listen_port) {
                    var dnsPort = shuntSection.dns_listen_port;
                    o.value('127.0.0.1#' + dnsPort, _('分流DNS端口: %s').format(dnsPort));
                    defaultDnsPort = '127.0.0.1#' + dnsPort;
                }
            });
        }

        o.value('custom', _('自定义DNS'));
        o.default = defaultDnsPort || 'custom';
        o.rmempty = false;

        o = s.taboption('basic', form.Value, 'proxy_dns_custom', _('自定义代理DNS'),
            _('指定代理域名使用的DNS服务器'));
        o.depends('proxy_dns', 'custom');

        o.default = '1.1.1.1#53';
        o.rmempty = false;

        o = s.taboption('basic', form.Flag, 'use_gfw', _('使用 GFW 列表'),
            _('启用 GFW 域名列表进行分流'));
        o.rmempty = true;
        o.depends('dns_service', 'dnsmasq');
        o.depends('dns_service', 'chinadns-ng');


        o = s.taboption('basic', form.Flag, 'use_chn', _('使用 CHN 列表'),
            _('启用中国域名列表进行分流'));
        o.rmempty = true;
        o.depends('dns_service', 'dnsmasq');
        o.depends('dns_service', 'chinadns-ng');

        // === 自定义脚本配置 ===
        o = s.taboption('basic', form.Value, 'start_hook', _('启动脚本路径'),
            _('会在dns服务启动阶段执行'));
        o.placeholder = '/etc/hijpass/dns-start.sh';
        o.rmempty = true;

        o = s.taboption('basic', form.Value, 'stop_hook', _('停止脚本路径'),
            _('会在dns服务停止阶段执行'));
        o.placeholder = '/etc/hijpass/dns-stop.sh';
        o.rmempty = true;

        // 域名直连列表
        o = createTextOption(s, 'domain_direct', 'domain_direct_hash', null,
            _('编辑域名直连列表配置'),
            hj.getFilePath('domain_direct'));

        // 域名代理列表
        o = createTextOption(s, 'domain_proxy', 'domain_proxy_hash', null,
            _('编辑域名代理列表配置，仅在DNS使用dnsmasq时使用'),
            hj.getFilePath('domain_proxy'));

        return m.render();
    }
});

// 创建文本编辑器选项
function createTextOption(s, tabName, fieldName, title, description, filePath) {
    let o = s.taboption(tabName, form.TextValue, fieldName, title, description);
    hj.setEditorOptionMembers(o, filePath, fieldName);
    return o;
}