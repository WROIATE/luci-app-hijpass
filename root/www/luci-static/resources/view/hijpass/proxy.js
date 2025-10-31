'use strict';
'require view';
'require form';
'require ui';
'require fs';
'require uci';
'require view.hijpass.hijpass as hj';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load(hj.CONF_NAME)
        ]);
    },

    render: function () {
        let m, s;

        m = new form.Map(hj.CONF_NAME, _('代理设置'),
            _('配置代理程序设置'));

        s = m.section(form.GridSection, hj.PROXY_NODE_TYPE)
        hj.setAnonymousGridSectionMembers(s);

        // 创建所有代理配置选项
        createProxyOptions(s);

        return m.render();
    }
});

// 创建启用状态选项
function createEnabledOption(s) {
    let o = s.option(form.Flag, 'enabled', _('启用'), _(''));
    o.modalonly = true;
    o.default = o.enabled;
    o.rmempty = false;
    return o;
}


// 创建Grid表格显示选项
function createGridDisplayOptions(s) {
    let o;

    // 运行命令（在表格中显示，截取显示）
    o = createCommandOption(s);
    o.modalonly = false;
    o.cfgvalue = function (section_id) {
        let command = uci.get(hj.CONF_NAME, section_id, 'command');
        if (command && command.length > 50) {
            return command.substring(0, 47) + '...';
        }
        return command || '';
    };

    o = createListenPortOption(s);
    o.modalonly = false;

    o = createSocksPortOption(s)
    o.modalonly = false;

    o = createEnabledOption(s);
    o.editable = true;
    o.modalonly = false;
}

// 创建节点名称编辑选项
function createNodeNameOption(s) {
    let o = s.option(form.Value, 'name', _('节点名称'),
        _('修改节点的名称，用于标识不同的代理节点'));
    o.modalonly = true;
    o.validate = hj.validateNameFormat;
    return o;
}

// 修改运行命令选项为编辑表单专用
function createCommandOption(s) {
    let o = s.option(form.Value, 'command', _('运行命令'),
        _('指定代理程序运行命令'));
    o.default = '/usr/bin/xray -c /etc/hijpass/proxy.json';
    o.rmempty = false;
    o.modalonly = true; // 只在编辑表单中显示
    return o;
}

// 修改其他选项为编辑表单专用
function createListenPortOption(s) {
    let o = s.option(form.Value, 'listen_port', _('监听端口'),
        _('指定透明代理监听端口号'));
    o.datatype = 'port';
    o.rmempty = false;
    o.modalonly = true;
    o.validate = hj.validateProxyPortConflict
    return o;
}

function createSocksPortOption(s) {
    let o = s.option(form.Value, 'socks_port', _('socks监听端口号'),
        _('指定socks监听端口号'));
    o.datatype = 'port';
    o.rmempty = false;
    o.modalonly = true;
    o.validate = hj.validateProxyPortConflict
    return o;
}

function createProcdEnvOption(s) {
    let o = s.option(form.DynamicList, 'procd_env', _('procd环境变量'),
        _('指定procd服务的环境变量，例如：SOME_VARIABLE=funtimes"'));
    o.modalonly = true; // 只在编辑表单中显示
    return o;
}

function createLogRedirectOption(s) {
    let o = s.option(form.Value, 'log_path', _('日志路径'),
        _('指定记录日志的具体路径'));
    o.default = '/tmp/log/hijpass-proxy.log';
    o.rmempty = false;
    o.modalonly = true; // 只在编辑表单中显示
    return o;
}

// 创建所有代理配置选项
function createProxyOptions(s) {
    // 创建Grid表格显示选项
    createGridDisplayOptions(s);
    createNodeNameOption(s);
    // 启用状态（在表格中显示并可直接修改）
    createEnabledOption(s);
    // 创建编辑表单选项
    createCommandOption(s);
    createListenPortOption(s);
    createSocksPortOption(s);
    createProcdEnvOption(s);
    createLogRedirectOption(s);
}
