import view from "view";
import uci from "uci";
import form from "form";
import {LuciUtils, WebUtils} from "../utils/common";
import {LuciFlied} from "../enum/hijpass";


const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME)
        ]);
    },

    handleSaveApply: LuciUtils.genHandleSaveApply(),

    render: function () {

        let m = new form.Map(LuciFlied.CONF_NAME, _('DNS分流设置'), _('配置DNS分流相关设置'));
        WebUtils.createServiceStatusSection(m, 'dns');

        let s = m.section(form.TypedSection, LuciFlied.DNS_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;

        s.tab('basic', _('基本设置'));
        s.tab('domain_direct', _('域名直连列表'));
        s.tab('domain_proxy', _('域名代理列表'));


        // === DNS分流配置 ===

        let dnsService = s.taboption('basic', form.ListValue, 'dns_service', _('分流服务'),
            _('选择DNS分流服务类型'));
        dnsService.value('chinadns-ng', 'chinadns-ng');
        dnsService.value('custom', _('自定义'));
        dnsService.default = 'chinadns-ng';
        dnsService.rmempty = false;

        let chinaDnsPort = s.taboption('basic', form.Value, 'cdg_port', _('监听端口'),
            _('指定ChinaDNS-NG的监听端口（默认不会重定向DNS端口，请自行配置）'));
        chinaDnsPort.depends('dns_service', 'chinadns-ng');
        chinaDnsPort.default = '53653';
        chinaDnsPort.datatype = "port"
        chinaDnsPort.rmempty = false;
        chinaDnsPort.validate = WebUtils.validatePortConflict;

        let directDns = s.taboption('basic', form.ListValue, 'direct_dns', _('直连域名DNS'),
            _('选择直连域名使用的DNS服务器'));
        directDns.value('system', _('使用系统DNS'));
        directDns.value('custom', _('自定义DNS'));
        directDns.default = 'system';
        directDns.rmempty = false;

        let directDnsCustom = s.taboption('basic', form.Value, 'direct_dns_custom', _('自定义直连DNS'),
            _('指定直连域名使用的DNS服务器'));
        directDnsCustom.depends('direct_dns', 'custom');
        directDnsCustom.default = '223.5.5.5#53';
        directDnsCustom.rmempty = false;

        let proxyDns = s.taboption('basic', form.ListValue, 'proxy_dns', _('代理域名DNS'),
            _('选择代理域名使用的DNS服务器'));
        proxyDns.depends('dns_service', 'chinadns-ng');
        proxyDns.value('system', _('使用系统DNS'));
        proxyDns.value('custom', _('自定义DNS'));
        proxyDns.default = 'system';
        proxyDns.rmempty = false;

        // 动态添加分流DNS监听端口选项
        let shuntSections = uci.sections('hijpass', 'shunt');
        let defaultDnsPort = null;
        if (shuntSections && shuntSections.length > 0) {
            shuntSections.forEach(function (shuntSection) {
                if (shuntSection.dns_listen_port) {
                    let dnsPort = shuntSection.dns_listen_port;
                    proxyDns.value('127.0.0.1#' + dnsPort, _('分流DNS端口: %s').format(dnsPort));
                    defaultDnsPort = '127.0.0.1#' + dnsPort;
                }
            });
        }

        proxyDns.default = defaultDnsPort || 'custom';
        proxyDns.rmempty = false;

        let proxyDnsCustom = s.taboption('basic', form.Value, 'proxy_dns_custom', _('自定义代理DNS'),
            _('指定代理域名使用的DNS服务器'));
        proxyDnsCustom.depends('proxy_dns', 'custom');
        proxyDnsCustom.default = '1.1.1.1#53';
        proxyDnsCustom.rmempty = false;

        let useGfw = s.taboption('basic', form.Flag, 'use_gfw', _('使用 GFW 列表'),
            _('启用 GFW 域名列表进行分流'));
        useGfw.rmempty = true;
        useGfw.depends('dns_service', 'chinadns-ng');


        let useChn = s.taboption('basic', form.Flag, 'use_chn', _('使用 CHN 列表'),
            _('启用中国域名列表进行分流'));
        useChn.rmempty = true;
        useChn.depends('dns_service', 'chinadns-ng');

        // === 自定义脚本配置 ===
        let startHook = s.taboption('basic', form.Value, 'start_hook', _('启动脚本路径'),
            _('会在dns服务启动阶段执行'));
        startHook.placeholder = '/etc/hijpass/dns-start.sh';
        startHook.rmempty = true;

        let stopHook = s.taboption('basic', form.Value, 'stop_hook', _('停止脚本路径'),
            _('会在dns服务停止阶段执行'));
        stopHook.placeholder = '/etc/hijpass/dns-stop.sh';
        stopHook.rmempty = true;

        // 域名直连列表
        WebUtils.createTextOption(s, 'domain_direct', 'domain_direct_hash', null,
            _('编辑域名直连列表配置，配合chinadns-ng使用'),
            WebUtils.getFilePath('domain_direct'));

        // 域名代理列表
        WebUtils.createTextOption(s, 'domain_proxy', 'domain_proxy_hash', null,
            _('编辑域名代理列表配置，配合chinadns-ng使用'),
            WebUtils.getFilePath('domain_proxy'));

        return m.render();
    }
});

export default v;