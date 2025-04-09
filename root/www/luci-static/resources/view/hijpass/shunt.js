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

        m = new form.Map('hijpass', _('分流设置'),
            _('配置分流规则和设置'));

        s = m.section(form.TypedSection, 'shunt');
        s.anonymous = true;
        s.addremove = false;

        s.tab('general', _('基本设置'));
        s.tab('config', _('分流配置'));

        o = s.taboption('general', form.ListValue, 'type', _('程序类型'),
            _('选择分流程序类型'));
        o.value('sing-box', 'sing-box');
        o.value('xray', 'xray');
        o.default = 'sing-box';
        o.rmempty = false;

        o = s.taboption('general', form.Value, 'dns_port', _('dns端口'),
            _('指定dns查询'));
        o.default = '15353';
        o.datatype = 'port';
        o.rmempty = false;

        o = s.taboption('general', form.Value, 'geo_ip_url', _('Geo IP 下载地址'),
            _('指定 Geo IP 数据库下载地址'));
        o.default = 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat';
        o.depends('type', 'xray');
        o.rmempty = false;

        o = s.taboption('general', form.Value, 'geo_site_url', _('Geo Site 下载地址'),
            _('指定 Geo Site 数据库下载地址'));
        o.default = 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat';
        o.depends('type', 'xray');
        o.rmempty = false;

        o = s.taboption('general', form.Flag, 'geo_auto_update', _('自动更新 Geo'),
            _('启用 Geo 数据库自动更新'));
        o.depends('type', 'xray');
        o.rmempty = false;

        o = s.taboption('general', form.Value, 'geo_update_interval', _('更新间隔'),
            _('指定更新间隔（分钟）'));
        o.depends('geo_auto_update', '1');
        o.default = '120';
        o.datatype = 'uinteger';
        o.rmempty = false;

        o = s.taboption('general', form.Flag, 'log_redirect', _('日志重定向'),
            _('重定向执行日志到文件，不开启默认输出至系统日志'));
        o.default = '0';
        o.rmempty = false;

        o = s.taboption('general', form.Value, 'log_path', _('日志路径'),
            _('指定记录日志的具体路径'));
        o.depends('log_redirect', '1');
        o.default = '/tmp/log/hijpass-shunt.log'
        o.rmempty = false;

        o = s.taboption('config', form.TextValue, '_shunt_config', null,
            _('编辑分流配置文件'));
        o.rows = 20;
        o.monospace = true;

        o.cfgvalue = function (section_id) {
            return fs.trimmed(common.CONF_PATH + '/shunt.json').then(function (value) {
                if (!value) {
                    return '{}';
                }
                return value;
            });
        };
        o.write = function (section_id, value) {
            return fs.write(common.CONF_PATH + '/shunt.json', value.trim().replace(/\r\n/g, '\n') + '\n');
        };

        return m.render();
    }
}); 