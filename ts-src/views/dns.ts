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
        s.tab('dns_hook', _('Hook 脚本'));


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

        // Hook 脚本编辑（启动传 start，停止传 stop，路径从 UCI hijpass.dns_hook 读取）
        WebUtils.createTextOption(s, 'dns_hook', 'dns_hook_hash', null,
            _('编辑 DNS Hook 脚本，启动时以 start 参数调用，停止时以 stop 参数调用'),
            WebUtils.getFilePath('dns_hook'));

        // 域名直连列表（仅 chinadns-ng 时通过 subsection 显示）
        let oDomainDirect = s.taboption('domain_direct', form.SectionValue, '_domain_direct',
            form.TypedSection, LuciFlied.DNS_SECTION_TYPE, _(''));
        oDomainDirect.depends('dns_service', 'chinadns-ng');
        let ssDirect = oDomainDirect.subsection;
        ssDirect.anonymous = true;
        ssDirect.addremove = false;
        WebUtils.setEditorOptionMembers(
            ssDirect.option(form.TextValue, 'domain_direct_hash', null,
                _('编辑域名直连列表配置，配合chinadns-ng使用')),
            WebUtils.getFilePath('domain_direct'), 'domain_direct_hash');

        // 域名代理列表（仅 chinadns-ng 时通过 subsection 显示）
        let oDomainProxy = s.taboption('domain_proxy', form.SectionValue, '_domain_proxy',
            form.TypedSection, LuciFlied.DNS_SECTION_TYPE, _(''));
        oDomainProxy.depends('dns_service', 'chinadns-ng');
        let ssProxy = oDomainProxy.subsection;
        ssProxy.anonymous = true;
        ssProxy.addremove = false;
        WebUtils.setEditorOptionMembers(
            ssProxy.option(form.TextValue, 'domain_proxy_hash', null,
                _('编辑域名代理列表配置，配合chinadns-ng使用')),
            WebUtils.getFilePath('domain_proxy'), 'domain_proxy_hash');

        return m.render();
    }
});

export default v;