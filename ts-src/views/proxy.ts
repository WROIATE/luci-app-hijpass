import view from "view";
import uci from "uci";
import {LuciFlied} from "../enum/hijpass";
import form from "form";
import {LuciUtils, WebUtils} from "../utils/common";
import fs from "fs";

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME)
        ]);
    },

    handleSaveApply: LuciUtils.genHandleSaveApply(),

    render: async function () {
        let m = new form.Map(LuciFlied.CONF_NAME, _('代理设置'),
            _('配置代理程序设置'));

        let s = m.section(form.GridSection, LuciFlied.PROXY_NODE_TYPE)
        WebUtils.setAnonymousGridSectionMembers(s);
        s.cloneable = true;
        // 创建所有代理配置选项
        let data = await getPortStatus();
        createProxyOptions(s, data);

        return m.render();
    },
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
function createGridDisplayOptions(s: LuCI.form.AbstractSection, data: { [key: string]: boolean }) {

    // 运行命令（在表格中显示，截取显示）
    let o = createCommandOption(s);
    o.modalonly = false;
    o.cfgvalue = function (section_id) {
        let command = uci.get(LuciFlied.CONF_NAME, section_id, 'command');
        if (command && command.length > 50) {
            return command.substring(0, 47) + '...';
        }
        return command || '';
    };
    let getPortStatusElement = function (section_id: string, port_key: string) {
        let value = uci.get(LuciFlied.CONF_NAME, section_id, port_key);
        return E('span', {
            'id': 'port-' + value,
            'style': 'color: ' + (data[value] ? 'green' : 'red')
        }, value);
    }

    o = s.option(form.TextValue, 'listen_port', _('监听端口'),
        _('指定透明代理监听端口号'));
    o.modalonly = false;
    o.textvalue = function (section_id: string) {
        return getPortStatusElement(section_id, 'listen_port');
    };

    o = s.option(form.TextValue, 'socks_port', _('socks监听端口号'),
        _('指定socks监听端口号'));
    o.modalonly = false;
    o.textvalue = function (section_id: string) {
        return getPortStatusElement(section_id, 'socks_port');
    };

    o = createEnabledOption(s);
    o.editable = true;
    o.modalonly = false;
}

// 创建节点名称编辑选项
function createNodeNameOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Value, 'name', _('节点名称'),
        _('修改节点的名称，用于标识不同的代理节点'));
    o.modalonly = true;
    o.validate = WebUtils.createTagValidator(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, 'name')
    return o;
}

// 修改运行命令选项为编辑表单专用
function createCommandOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Value, 'command', _('运行命令'),
        _('指定代理程序运行命令'));
    o.default = '/usr/bin/xray -c /etc/hijpass/proxy.json';
    o.rmempty = false;
    o.modalonly = true; // 只在编辑表单中显示
    return o;
}

// 修改其他选项为编辑表单专用
function createListenPortOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Value, 'listen_port', _('监听端口'),
        _('指定透明代理监听端口号'));
    o.datatype = 'port';
    o.rmempty = false;
    o.modalonly = true;
    o.validate = WebUtils.validateProxyPortConflict
    return o;
}

function createSocksPortOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Value, 'socks_port', _('socks监听端口号'),
        _('指定socks监听端口号'));
    o.datatype = 'port';
    o.rmempty = false;
    o.modalonly = true;
    o.validate = WebUtils.validateProxyPortConflict
    return o;
}

function createProcdEnvOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.DynamicList, 'procd_env', _('procd环境变量'),
        _('指定procd服务的环境变量，例如：SOME_VARIABLE=funtimes"'));
    o.modalonly = true; // 只在编辑表单中显示
    return o;
}

function createLogEnabledOption(s: LuCI.form.AbstractSection) {
    return WebUtils.createLogFlagOption(s, LuciFlied.CONF_NAME, undefined);
}

// function createLogRedirectOption(s: LuCI.form.AbstractSection) {
//     let o = s.option(form.Value, 'log_path', _('日志路径'),
//         _('指定记录日志的具体路径'));
//     o.default = '/tmp/log/hijpass-proxy.log';
//     o.rmempty = false;
//     o.modalonly = true; // 只在编辑表单中显示
//     return o;
// }

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
    createSocksPortOption(s);
    createProcdEnvOption(s);
    createLogEnabledOption(s);
    // createLogRedirectOption(s);
}

async function getPortStatus() {
    let portList = []
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section) => {
        portList.push(section.listen_port)
        portList.push(section.socks_port)
    });
    try {
        return await L.resolveDefault(fs.exec_direct(`/usr/lib/hijpass/net.sh`, ['port'].concat(portList), "json"), {});
    } catch (error) {
        console.log('Error:', error);
    }
}

export default v;