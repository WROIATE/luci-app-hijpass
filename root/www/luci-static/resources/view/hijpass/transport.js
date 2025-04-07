'use strict';
'require view';
'require form';
'require ui';
'require fs';
'require uci';
'require view.hijpass.common as common'

return view.extend({
    load: function () {
        return Promise.all([
            uci.load('hijpass')
        ]);
    },

    render: function () {
        var m, s, o;

        m = new form.Map('hijpass', _('传输设置'),
            _('配置传输层设置'));

        s = m.section(form.TypedSection, 'transport');
        s.anonymous = true;
        s.addremove = false;

        s.tab('general', _('基本设置'));
        s.tab('v4whitelist', _('IPv4 白名单'));
        s.tab('v6whitelist', _('IPv6 白名单'));
        s.tab('firewall', _('防火墙规则'));

        o = s.taboption('general', form.ListValue, 'tproxy_proto', _('TPROXY 协议'),
            _('指定 TPROXY 协议类型'));
        o.value('tcp', 'TCP');
        o.value('udp', 'UDP');
        o.value('tcp,udp', 'TCP + UDP');
        o.default = 'tcp,udp';
        o.rmempty = false;

        o = s.taboption('general', form.Value, 'shunt_port', _('分流端口'),
            _('指定分流端口号'));
        o.default = '1041';
        o.datatype = 'port';
        o.rmempty = false;

        o = s.taboption('v4whitelist', form.TextValue, '_v4cidr', _(''),
            _('编辑 IPv4 CIDR 白名单配置'));
        o.rows = 20;
        o.cols = 64;
        o.monospace = true;
        let v4List = common.CONF_PATH + '/white-v4.conf'
        o.cfgvalue = function (section_id) {
            return fs.trimmed(v4List).then(function (value) {
                if (!value) {
                    return '';
                }
                return value;
            });
        };
        o.write = function (section_id, formvalue) {
            return fs.write(v4List, formvalue.trim().replace(/\r\n/g, '\n') + '\n');
        };

        let v6ist = common.CONF_PATH + '/white-v6.conf'
        o = s.taboption('v6whitelist', form.TextValue, '_v6cidr', _(''),
            _('编辑 IPv6 CIDR 白名单配置'));
        o.rows = 20;
        o.cols = 64;
        o.monospace = true;
        o.cfgvalue = function (section_id) {
            return fs.trimmed(v6ist).then(function (value) {
                if (!value) {
                    return '';
                }
                return value;
            });
        };
        o.write = function (section_id, formvalue) {
            return fs.write(v6ist, formvalue.trim().replace(/\r\n/g, '\n') + '\n');
        };

        let nftRules = common.CONF_PATH + '/fw4-template.nft'
        o = s.taboption('firewall', form.TextValue, '_nft', _(''),
            _('编辑防火墙 nftables 规则'));
        o.rows = 20;
        o.cols = 64;
        o.monospace = true;
        o.cfgvalue = function (section_id) {
            return fs.trimmed(nftRules).then(function (value) {
                if (!value) {
                    return '';
                }
                return value;
            });
        };
        o.write = function (section_id, formvalue) {
            return fs.write(nftRules, formvalue.trim().replace(/\r\n/g, '\n') + '\n');
        };

        return m.render();
    }
}); 