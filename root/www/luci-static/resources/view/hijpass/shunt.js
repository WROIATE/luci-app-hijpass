'use strict';
'require view';
'require form';
'require ui';
'require fs';
'require uci';
'require view.hijpass.hijpass as hj'


const XRAY_STRATEGY_VALUES = ['UseIP', 'UseIPv4', 'UseIPv6', 'UseSystem']
const SING_BOX_STRATEGY_VALUES = ['prefer_ipv4', 'prefer_ipv6', 'ipv4_only', 'ipv6_only']

return view.extend({
    load: function () {
        return Promise.all([
            uci.load(hj.CONF_NAME)
        ]);
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
        createConfigEditor(s)
        return m.render();
    }
});

// 创建基础配置选项
function createBasicOptions(s) {
    let o;

    // 分流类型
    o = s.taboption('basic', form.ListValue, 'type', _('分流类型'),
        _('选择分流程序类型'));
    o.value('xray', 'xray');
    o.value('sing-box', 'sing-box');
    o.default = 'xray';
    o.rmempty = false;

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
}


function createConfigEditor(s) {
    let o = s.taboption('config', form.TextValue, 'shunt_hash', null, '修改分流配置文件');
    hj.setEditorOptionMembers(o, hj.getFilePath('shunt_conf'), 'shunt_hash');
}

// 创建所有标签页
function createTabs(s) {
    s.tab('basic', _('基础配置'));
    s.tab('config', _('分流配置编辑'));
}