import view from "view";
import uci from "uci";
import {LuciFlied} from "../enum/hijpass";
import form from "form";
import {LuciUtils, WebUtils} from "../utils/common";

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.SERVER_CONF_NAME),
            uci.load(LuciFlied.CONF_NAME),
            LuciUtils.getServiceInstances(LuciFlied.SERVER_CONF_NAME),
        ]);
    },

    render: async function (data: any[]) {
        let m = new form.Map(LuciFlied.SERVER_CONF_NAME, _('服务端设置'),
            _('配置服务端程序设置'));

        let globalSection = m.section(form.TypedSection, LuciFlied.SERVER_CONF_NAME)
        globalSection.addremove = false;
        globalSection.anonymous = true;
        globalSection.option(form.Flag, 'enabled', _('启用'), _(''))
        let s = m.section(form.GridSection, LuciFlied.SERVER_NODE_TYPE)
        WebUtils.setGridSectionMembers(s);
        s.anonymous = true;
        s.sectiontitle = function (sectionId: any) {
            return uci.get(LuciFlied.SERVER_CONF_NAME, sectionId, 'name')
                || sectionId;
        };
        s.cloneable = true;
        const instances = data[2] ?? {};
        createProxyOptions(s, instances);

        return m.render();
    },
});

// 创建启用状态选项
function createEnabledOption(s: LuCI.form.AbstractSection) {
    let enabled = s.option(form.Flag, 'enabled', _('启用'), _(''));
    enabled.modalonly = true;
    enabled.default = '1';
    enabled.rmempty = false;
    return enabled;
}

function createFirewallEnabledOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Flag, 'allow_firewall', _('允许公网访问'), _(''));
    o.default = '1';
    o.rmempty = false;
    return o;
}

// 创建Grid表格显示选项
function createGridDisplayOptions(s: LuCI.form.AbstractSection, instances: any) {

    // 运行命令（在表格中显示，截取显示）
    let o = createCommandOption(s);
    o.modalonly = false;
    o.cfgvalue = function (section_id) {
        let command = uci.get(LuciFlied.SERVER_CONF_NAME, section_id, 'command');
        if (command && command.length > 50) {
            return command.substring(0, 47) + '...';
        }
        return command || '';
    };

    let portOpt = s.option(form.TextValue, 'listen_port', _('监听端口'),
        _('指定服务端监听端口号'));
    portOpt.modalonly = false;
    portOpt.textvalue = function (section_id: string) {
        let value = uci.get(LuciFlied.SERVER_CONF_NAME, section_id, 'listen_port');
        return E('span', {}, value || '-');
    };

    let statusOpt = s.option(form.TextValue, 'run_status', _('状态'), _(''));
    statusOpt.modalonly = false;
    statusOpt.textvalue = function (section_id: string) {
        const name = uci.get(LuciFlied.SERVER_CONF_NAME, section_id, 'name');
        const instanceName = section_id + (name ? '-' + name : '');
        const running = instances?.[instanceName]?.running ?? false;
        return E('span', {style: 'color:' + (running ? 'green' : 'red')}, running ? _('运行中') : _('未运行'));
    };

    o = createEnabledOption(s);
    o.editable = true;
    o.modalonly = false;
}

// 创建节点名称编辑选项
function createNodeNameOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Value, 'name', _('节点名称'),
        _('修改节点的名称，用于标识不同服务节点'));
    o.modalonly = true;
    o.validate = WebUtils.createTagValidator(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE, 'name')
    return o;
}

// 修改运行命令选项为编辑表单专用
function createCommandOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Value, 'command', _('运行命令'),
        _('指定服务端程序运行命令，使用 {conf_path} 引用自动生成的配置文件路径'));
    o.default = '/usr/bin/xray -c {conf_path}';
    o.rmempty = false;
    o.modalonly = true;
    return o;
}

// 配置文件内容编辑器
function createConfContentOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.TextValue, 'custom_conf', _('配置文件内容'),
        _('编辑配置文件内容，保存时自动写入对应路径'));
    o.modalonly = true;
    const serverDir = uci.get_first(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_CONF_NAME, 'server_dir') || '/etc/hijpass/server';
    WebUtils.setConfContentOptionMembers(o, LuciFlied.SERVER_CONF_NAME, serverDir);
    return o;
}

// 修改其他选项为编辑表单专用
function createListenPortOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Value, 'listen_port', _('监听端口'),
        _('指定服务端监听端口号'));
    o.datatype = 'port';
    o.rmempty = false;
    o.modalonly = true;
    o.validate = WebUtils.validatePortConflict
    return o;
}

function createProcdEnvOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.DynamicList, 'procd_env', _('procd环境变量'),
        _('指定procd服务的环境变量，例如：SOME_VARIABLE=funtimes'));
    o.modalonly = true; // 只在编辑表单中显示
    return o;
}

function createLogRedirectOption(s: LuCI.form.AbstractSection) {
    return WebUtils.createLogFlagOption(s, LuciFlied.SERVER_CONF_NAME, undefined);
}

// 创建所有代理配置选项
function createProxyOptions(s: LuCI.form.AbstractSection, instances: any) {
    // 创建Grid表格显示选项
    createGridDisplayOptions(s, instances);
    createNodeNameOption(s);
    // 启用状态（在表格中显示并可直接修改）
    createEnabledOption(s);
    // 创建编辑表单选项
    createCommandOption(s);
    createConfContentOption(s);
    createListenPortOption(s);
    createFirewallEnabledOption(s);
    createProcdEnvOption(s);
    createLogRedirectOption(s);
}


export default v;