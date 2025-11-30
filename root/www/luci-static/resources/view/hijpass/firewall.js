'use strict';
'require view';
'require form';
'require ui';
'require fs';
'require uci';
'require network'
'require view.hijpass.hijpass as hj'

return view.extend({
    load: function () {
        return Promise.all([
            uci.load(hj.HijpassEnum.CONF_NAME),
            network.getDevices()
        ]);
    },

    render: function () {
        let m, s;

        m = new form.Map(hj.HijpassEnum.CONF_NAME, _('防火墙配置'),
            _('配置nftables相关功能'));

        s = m.section(form.TypedSection, hj.HijpassEnum.FIREWALL_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;

        // 创建标签页
        createTabs(s);

        // 创建基础配置选项
        createGeneralOptions(s);

        // 创建文本编辑选项
        createTextOptions(s);

        return m.render();
    }
});

// 创建基础配置选项
function createGeneralOptions(s) {
    let o;

    // TPROXY 协议配置
    o = s.taboption('basic', form.ListValue, 'tproxy_proto', _('TPROXY 协议'),
        _('指定 TPROXY 协议类型'));
    o.value('tcp', 'TCP');
    o.value('udp', 'UDP');
    o.value('tcp,udp', 'TCP + UDP');
    o.default = 'tcp,udp';
    o.rmempty = false;

    // 代理端口配置
    createPortOptions(s);

    // 列表选项配置
    createListOptions(s);
}

// 创建端口选择选项
function createPortOptions(s) {

    let o = s.taboption('basic', form.ListValue, 'proxy_port', _('代理端口'),
        _('选择代理应用端口号，可从代理节点端口中选择'));


    // 动态添加代理节点端口选项
    uci.sections(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.PROXY_NODE_TYPE, (section) => {
        if (section.listen_port) {
            let displayName = _('代理节点 %s: %s').format(section.name, section.listen_port);
            o.value(section.listen_port, displayName);
        }
    });
    o.value('', _('不使用'))
    o.default = ''
    o.rmempty = true;

    o = s.taboption('basic', form.ListValue, 'shunt_port', _('默认分流端口'),
        _('选择分流应用端口号，可从分流端口或代理节点端口中选择'));

    // 动态添加分流端口选项
    let shuntListenPort = uci.get_first(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.SHUNT_SECTION_TYPE, 'shunt_listen_port');
    if (shuntListenPort) {
        o.value(shuntListenPort, _('分流端口: %s').format(shuntListenPort));
    }

    // 动态添加代理节点端口选项
    uci.sections(hj.HijpassEnum.CONF_NAME, hj.HijpassEnum.PROXY_NODE_TYPE, (section) => {
        if (section.listen_port) {
            let displayName = _('代理节点 %s: %s').format(section.name, section.listen_port);
            o.value(section.listen_port, displayName);
        }
    });
    o.value('', _('不使用'))
    o.default = ''
    o.rmempty = true;
}

// 创建列表选项
function createListOptions(s) {
    let o;

    o = s.taboption('basic', form.Flag, 'use_chnroute', _('使用 CHN 路由'),
        _('启用中国 IP 路由列表进行分流'));

    o.rmempty = true;
}

// 创建文本编辑器选项
function createTextOption(s, tabName, fieldName, title, description, filePath) {
    let o = s.taboption(tabName, form.TextValue, fieldName, title, description);
    hj.WebUtils.setEditorOptionMembers(o, filePath, fieldName);
    return o;
}

// 创建所有文本编辑选项
function createTextOptions(s) {

    // IP 直连列表（IPv4 + IPv6）
    createTextOption(s, 'ip_direct', 'ip_direct_hash', null,
        _('编辑 IP CIDR 直连列表配置（支持 IPv4 和 IPv6）'),
        hj.WebUtils.getFilePath('ip_direct'));

    // IP 代理列表（IPv4 + IPv6）
    createTextOption(s, 'ip_proxy', 'ip_proxy_hash', null,
        _('编辑 IP CIDR 代理列表配置（支持 IPv4 和 IPv6）'), hj.WebUtils.getFilePath('ip_proxy'));

    // 防火墙规则
    createTextOption(s, 'nftables', 'nft_hash', null, _('编辑防火墙 nftables 规则'), hj.WebUtils.getFilePath('nft'));

    // 用户自定义启动脚本
    createTextOption(s, 'hook', 'nft_hook_hash', null,
         _('用户自定义脚本，会在服务服务规则初始化后执行脚本内容，不会在停止时执行，因此请不要在脚本中修改hijpass表以外的规则'), 
         hj.WebUtils.getFilePath('nft_hook'));
}

// 创建所有标签页
function createTabs(s) {
    s.tab('basic', _('基本设置'));
    s.tab('ip_direct', _('IP 直连列表'));
    s.tab('ip_proxy', _('IP 代理列表'));
    s.tab('nftables', _('防火墙规则'));
    s.tab('hook', _('自定义脚本'));
}
