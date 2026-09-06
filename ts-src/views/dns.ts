import view from "view";
import uci from "uci";
import form from "form";
import {SaveApplyUtils} from "../utils/actions/save-apply/index";
import {ServiceUtils} from "../utils/base/luci/service";
import {FormUtils} from "../utils/base/luci/form";
import {ValidationUtils} from "../utils/base/luci/validation";
import {FilePathUtils} from "../utils/base/files/paths";
import {LuciFlied} from "../enum/hijpass";


const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME)
        ]);
    },

    handleSaveApply: SaveApplyUtils.genHandleSaveApply(),

    render: function () {

        let m = new form.Map(LuciFlied.CONF_NAME, _('DNS Routing Configuration'), _('Configure DNS Routing'));
        ServiceUtils.createStatusSection(m, 'dns');

        let s = m.section(form.TypedSection, LuciFlied.DNS_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;

        s.tab('basic', _('Basic Settings'));
        s.tab('domain_direct', _('Domain Direct List'));
        s.tab('domain_proxy', _('Domain Proxy List'));
        s.tab('dns_hook', _('Hook Script'));


        // === DNS分流配置 ===

        let dnsService = s.taboption('basic', form.ListValue, 'dns_service', _('Shunt Service'),
            _('Select DNS Service Type'));
        dnsService.value('chinadns-ng', 'chinadns-ng');
        dnsService.value('custom', _('Custom'));
        dnsService.default = 'chinadns-ng';
        dnsService.rmempty = false;

        let chinaDnsPort = s.taboption('basic', form.Value, 'cdg_port', _('Listen Port'),
            _('ChinaDNS-NG Listen Port'));
        chinaDnsPort.depends('dns_service', 'chinadns-ng');
        chinaDnsPort.default = '53653';
        chinaDnsPort.datatype = "port"
        chinaDnsPort.rmempty = false;
        chinaDnsPort.validate = ValidationUtils.validatePortConflict;

        let directDns = s.taboption('basic', form.ListValue, 'direct_dns', _('Direct Domain DNS'),
            _('Select Direct Domain DNS'));
        directDns.depends('dns_service', 'chinadns-ng');
        directDns.value('dnsmasq', 'dnsmasq');
        directDns.value('custom', _('Custom DNS'));
        directDns.default = 'dnsmasq';
        directDns.rmempty = false;

        let directDnsCustom = s.taboption('basic', form.Value, 'direct_dns_custom', _('Custom Direct DNS'),
            _('Direct Domain DNS Server'));
        directDnsCustom.depends({ dns_service: 'chinadns-ng', direct_dns: 'custom' });
        directDnsCustom.default = '223.5.5.5#53';
        directDnsCustom.rmempty = false;

        let proxyDns = s.taboption('basic', form.ListValue, 'proxy_dns', _('Proxy Domain DNS'),
            _('Select Proxy Domain DNS'));
        proxyDns.depends('dns_service', 'chinadns-ng');
        proxyDns.value('dnsmasq', 'dnsmasq');
        proxyDns.value('custom', _('Custom DNS'));
        proxyDns.default = 'dnsmasq';
        proxyDns.rmempty = false;

        // 动态添加分流DNS监听端口选项
        let shuntSections = uci.sections('hijpass', 'shunt');
        let defaultDnsPort = null;
        if (shuntSections && shuntSections.length > 0) {
            shuntSections.forEach(function (shuntSection) {
                if (shuntSection.enabled !== '0' && shuntSection.dns_listen_port) {
                    let dnsPort = shuntSection.dns_listen_port;
                    proxyDns.value('127.0.0.1#' + dnsPort, _('Shunt DNS Port: %s').format(dnsPort));
                    defaultDnsPort = '127.0.0.1#' + dnsPort;
                }
            });
        }

        proxyDns.default = defaultDnsPort || 'custom';
        proxyDns.rmempty = false;

        let proxyDnsCustom = s.taboption('basic', form.Value, 'proxy_dns_custom', _('Custom Proxy DNS'),
            _('Proxy Domain DNS Server'));
        proxyDnsCustom.depends({ dns_service: 'chinadns-ng', proxy_dns: 'custom' });
        proxyDnsCustom.default = '1.1.1.1#53';
        proxyDnsCustom.rmempty = false;

        let useGfw = s.taboption('basic', form.Flag, 'use_gfw', _('Use GFW List'),
            _('Enable GFW Domain List'));
        useGfw.rmempty = true;
        useGfw.depends('dns_service', 'chinadns-ng');


        let useChn = s.taboption('basic', form.Flag, 'use_chn', _('Use CHN List'),
            _('Enable CHN Domain List'));
        useChn.rmempty = true;
        useChn.depends('dns_service', 'chinadns-ng');

        // Hook 脚本编辑（启动传 start，停止传 stop，路径从 UCI hijpass.dns_hook 读取）
        FormUtils.createTextOption(s, 'dns_hook', 'dns_hook_hash', null,
            _('Edit DNS Hook Script'),
            FilePathUtils.getFilePath('dns_hook'));

        // 域名直连列表（仅 chinadns-ng 时通过 subsection 显示）
        let oDomainDirect = s.taboption('domain_direct', form.SectionValue, '_domain_direct',
            form.TypedSection, LuciFlied.DNS_SECTION_TYPE, '');
        oDomainDirect.depends('dns_service', 'chinadns-ng');
        let ssDirect = oDomainDirect.subsection;
        ssDirect.anonymous = true;
        ssDirect.addremove = false;
        FormUtils.setEditorOptionMembers(
            ssDirect.option(form.TextValue, 'domain_direct_hash', null,
                _('Edit Domain Direct List')),
            FilePathUtils.getFilePath('domain_direct'), 'domain_direct_hash');

        // 域名代理列表（仅 chinadns-ng 时通过 subsection 显示）
        let oDomainProxy = s.taboption('domain_proxy', form.SectionValue, '_domain_proxy',
            form.TypedSection, LuciFlied.DNS_SECTION_TYPE, '');
        oDomainProxy.depends('dns_service', 'chinadns-ng');
        let ssProxy = oDomainProxy.subsection;
        ssProxy.anonymous = true;
        ssProxy.addremove = false;
        FormUtils.setEditorOptionMembers(
            ssProxy.option(form.TextValue, 'domain_proxy_hash', null,
                _('Edit Domain Proxy List')),
            FilePathUtils.getFilePath('domain_proxy'), 'domain_proxy_hash');

        return m.render();
    }
});

export default v;
