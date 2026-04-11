import view from "view";
import uci from "uci";
import {LuciFlied} from "../enum/hijpass";
import form from "form";
import {WebUtils} from "../utils/common";
import fs from "fs";

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.SERVER_CONF_NAME),
            uci.load(LuciFlied.CONF_NAME),
        ]);
    },

    render: async function () {
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
        // 创建所有代理配置选项
        let data = await getPortStatus();
        createProxyOptions(s, data);

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
function createGridDisplayOptions(s: LuCI.form.AbstractSection, data: { [key: string]: boolean }) {

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
    let getPortStatusElement = function (section_id: string, port_key: string) {
        let value = uci.get(LuciFlied.SERVER_CONF_NAME, section_id, port_key);
        return E('span', {
            'id': 'port-' + value,
            'style': 'color: ' + (data[value] ? 'green' : 'red')
        }, value);
    }

    o = s.option(form.TextValue, 'listen_port', _('监听端口'),
        _('指定服务端监听端口号'));
    o.modalonly = false;
    o.textvalue = function (section_id: string) {
        return getPortStatusElement(section_id, 'listen_port');
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
        _('指定服务端程序运行命令'));
    o.default = '/usr/bin/xray -c /etc/hijpass/proxy.json';
    o.rmempty = false;
    o.modalonly = true; // 只在编辑表单中显示
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
function createProxyOptions(s: LuCI.form.AbstractSection, data: { [key: string]: boolean }) {
    // 创建Grid表格显示选项
    createGridDisplayOptions(s, data);
    createNodeNameOption(s);
    // 启用状态（在表格中显示并可直接修改）
    createEnabledOption(s);
    // 创建编辑表单选项
    createCommandOption(s);
    createListenPortOption(s);
    createFirewallEnabledOption(s);
    createProcdEnvOption(s);
    createLogRedirectOption(s);
}

async function getPortStatus() {
    let portList = []
    uci.sections(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE, (section) => {
        if (section.listen_port) portList.push(section.listen_port);
    });
    try {
        return await L.resolveDefault(fs.exec_direct(`/usr/lib/hijpass/net.sh`, ['port'].concat(portList), "json"), {});
    } catch (error) {
        console.log('Error:', error);
    }
}

export default v;