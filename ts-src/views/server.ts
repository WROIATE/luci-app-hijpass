import view from "view";
import form from "form";
import uci from "uci";
import ui from "ui";
import { Backend } from "../utils/backend";
import { LuciFlied } from "../enum/hijpass";
import { ServiceUtils } from "../utils/base/luci/service";
import { FormUtils } from "../utils/base/luci/form";
import { ValidationUtils } from "../utils/base/luci/validation";
import { UciUtils } from "../utils/base/luci/uci";
import { NotificationUtils } from "../utils/base/luci/notification";
import { createNodeLogButton } from "../utils/feature/log/node";
import { ConfigPreviewUtils } from "../utils/feature/config/preview";

const configName = LuciFlied.SERVER_CONF_NAME;
const protocols = { shadowsocks: 'Shadowsocks', hysteria2: 'Hysteria2', vless: 'VLESS' };

export default view.extend({
    load: () => Promise.all([uci.load(configName), uci.load(LuciFlied.CONF_NAME),
        ServiceUtils.getServiceInstances(configName)]),

    handleSaveApply: async function (ev: Event, mode?: string | number) {
        try {
            await this.handleSave(ev);
            await Backend.validateServers(JSON.stringify(uci.sections(configName, undefined)));
            await uci.save();
            ui.changes.apply(mode == '0');
        } catch (error) {
            NotificationUtils.error(_('Configuration Apply Failed'), error.message, 5000);
        }
    },

    render: async function (data: any[]) {
        const map = new form.Map(configName, _('Local Server'), _('Run as Local Server'));
        const global = map.section(form.TypedSection, configName);
        global.anonymous = true;
        global.addremove = false;
        global.option(form.Flag, 'enabled', _('Enable')).rmempty = false;

        const section = map.section(form.GridSection, LuciFlied.SERVER_NODE_TYPE);
        FormUtils.setGridSectionMembers(section);
        section.anonymous = true;
        section.sectiontitle = id => uci.get(configName, id, 'name') || id;
        section.handleAdd = function (ev: Event) {
            return form.GridSection.prototype.handleAdd.call(this, ev, UciUtils.generateUniqueSectionId(configName));
        };
        createOptions(section, data[2] || {});
        const legacy = uci.sections(configName, LuciFlied.SERVER_NODE_TYPE).some(node => node.legacy_custom === '1');
        const content = await map.render();
        return E('div', {}, [
            ...(legacy ? [E('div', { class: 'alert-message warning' },
                _('Custom server nodes have been disabled. Edit each node to select a protocol and configure credentials. Original JSON files are retained as .legacy.json.'))] : []),
            content,
        ]);
    },
});

function createOptions(section: LuCI.form.AbstractSection, instances: any) {
    // 每个 UCI 字段只有一个表单选项，列表显示和弹窗编辑共用，避免值被重复解析覆盖。
    const coreOption = section.option(form.ListValue, 'core', _('Core'));
    coreOption.value('sing-box', 'sing-box');
    coreOption.value('xray', 'Xray');
    coreOption.default = 'sing-box';
    coreOption.rmempty = false;

    const typeOption = section.option(form.ListValue, 'type', _('Protocol'));
    typeOption.value('', _('Select protocol'));
    for (const [value, label] of Object.entries(protocols)) typeOption.value(value, label);
    typeOption.rmempty = false;
    typeOption.write = function (id: string, value: string) {
        uci.set(configName, id, 'type', value);
        if (value) {
            for (const key of ['legacy_custom', 'command', 'custom_conf_hash', 'procd_env']) uci.unset(configName, id, key);
        }
    };

    const listenPortOption = section.option(form.Value, 'listen_port', _('Listen Port'));
    listenPortOption.datatype = 'port';
    listenPortOption.rmempty = false;
    listenPortOption.validate = ValidationUtils.validatePortConflict;

    const status = section.option(form.DummyValue, 'run_status', _('Status'));
    status.modalonly = false;
    status.textvalue = (id: string) => {
        const name = uci.get(configName, id, 'name');
        const running = instances[id + (name ? '-' + name : '')]?.running;
        return E('span', { style: 'color:' + (running ? 'green' : 'red') }, running ? _('Running') : _('Not Running'));
    };
    const allowFirewallOption = section.option(form.Flag, 'allow_firewall', _('Allow Public Access'));
    allowFirewallOption.default = '1';
    allowFirewallOption.rmempty = false;
    const enabledOption = section.option(form.Flag, 'enabled', _('Enable'));
    enabledOption.default = '1';
    enabledOption.rmempty = false;
    enabledOption.editable = true;

    const actions = section.option(form.DummyValue, 'actions', '');
    actions.modalonly = false;
    actions.textvalue = (id: string) => {
        const log = createNodeLogButton(configName, id);
        const preview = E('button', { class: 'btn cbi-button', click: async () => {
            try {
                const result = await Backend.renderServer(JSON.stringify(uci.sections(configName, undefined)), id);
                ui.showModal(_('Configuration Preview'), [
                    ConfigPreviewUtils.render(JSON.stringify(result.config, null, 2), _('Configuration Preview')),
                    E('div', { class: 'right' }, E('button', { class: 'btn', click: ui.hideModal }, _('Close'))),
                ]);
            } catch (error) { NotificationUtils.error(_('Configuration Preview'), error.message); }
        } }, _('Preview'));
        return E('span', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, log ? [preview, log] : [preview]);
    };

    function field(kind: LuCI.form.Value, key: string, label: string, dependencies?: Record<string, string>[], description?: string) {
        const value = section.option(kind, key, label, description);
        value.modalonly = true;
        if (dependencies) for (const dependency of dependencies) value.depends(dependency);
        return value;
    }
    const nameOption = field(form.Value, 'name', _('Node Name'));
    nameOption.rmempty = false;
    nameOption.validate = ValidationUtils.createTagValidator(configName, LuciFlied.SERVER_NODE_TYPE, 'name');
    const listenOption = field(form.Value, 'listen', _('Listen Address'));
    listenOption.default = '::';
    listenOption.datatype = 'ipaddr';
    listenOption.rmempty = false;

    const methodOption = field(form.ListValue, 'method', _('Encryption Method'), [{ type: 'shadowsocks' }],
        _('For Shadowsocks 2022, enter a base64 key: 16 bytes for AES-128, 32 bytes for other methods.'));
    for (const method of ['2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm', '2022-blake3-chacha20-poly1305',
        'aes-128-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305']) methodOption.value(method);
    methodOption.default = '2022-blake3-aes-128-gcm';
    methodOption.rmempty = false;
    const passwordOption = field(form.Value, 'password', _('Password'), [{ type: 'shadowsocks' }, { type: 'hysteria2' }]);
    passwordOption.password = true;
    passwordOption.rmempty = false;
    const uuidOption = field(form.Value, 'uuid', _('UUID'), [{ type: 'vless' }]);
    uuidOption.rmempty = false;
    uuidOption.datatype = 'uuid';

    const transportOption = field(form.ListValue, 'transport', _('Transport'), [{ type: 'vless' }]);
    for (const transport of ['tcp', 'ws', 'grpc']) transportOption.value(transport);
    transportOption.default = 'tcp';
    transportOption.rmempty = false;
    const wsPathOption = field(form.Value, 'ws_path', _('WebSocket Path'), [{ type: 'vless', transport: 'ws' }]);
    wsPathOption.default = '/';
    wsPathOption.rmempty = false;
    const grpcServiceNameOption = field(form.Value, 'grpc_service_name', _('gRPC Service Name'), [{ type: 'vless', transport: 'grpc' }]);
    grpcServiceNameOption.rmempty = false;
    const securityOption = field(form.ListValue, 'security', _('Transport Security'), [{ type: 'vless' }]);
    securityOption.value('tls', 'TLS');
    securityOption.value('reality', 'REALITY');
    securityOption.value('none', _('None'));
    securityOption.default = 'tls';
    securityOption.rmempty = false;
    const flowOption = field(form.ListValue, 'flow', _('Flow'), [{ type: 'vless', transport: 'tcp', security: 'tls' },
        { type: 'vless', transport: 'tcp', security: 'reality' }]);
    flowOption.value('', _('None'));
    flowOption.value('xtls-rprx-vision', 'xtls-rprx-vision');

    const tls = [{ type: 'hysteria2' }, { type: 'vless', security: 'tls' }];
    field(form.Value, 'server_name', _('Server Name (SNI)'), [...tls, { type: 'vless', security: 'reality' }]);
    const certificatePathOption = field(form.Value, 'certificate_path', _('Certificate File'), tls);
    certificatePathOption.rmempty = false;
    const keyPathOption = field(form.Value, 'key_path', _('Private Key File'), tls);
    keyPathOption.rmempty = false;

    const reality = [{ type: 'vless', security: 'reality' }];
    const realityServerOption = field(form.Value, 'reality_server', _('REALITY Handshake Server'), reality);
    realityServerOption.datatype = 'host';
    realityServerOption.rmempty = false;
    const realityPortOption = field(form.Value, 'reality_port', _('REALITY Handshake Port'), reality);
    realityPortOption.default = '443';
    realityPortOption.datatype = 'port';
    realityPortOption.rmempty = false;
    const realityPrivateKeyOption = field(form.Value, 'reality_private_key', _('REALITY Private Key'), reality);
    realityPrivateKeyOption.password = true;
    realityPrivateKeyOption.rmempty = false;
    field(form.Value, 'reality_short_id', _('REALITY Short ID'), reality);

    const hysteria = [{ type: 'hysteria2', core: 'sing-box' }];
    const obfsPasswordOption = field(form.Value, 'obfs_password', _('Salamander Password'), hysteria);
    obfsPasswordOption.password = true;
    for (const [key, label] of [['up_mbps', _('Upload Bandwidth (Mbps)')], ['down_mbps', _('Download Bandwidth (Mbps)')]]) {
        const bandwidthOption = field(form.Value, key, label, hysteria);
        bandwidthOption.datatype = 'range(0,1000000)';
        bandwidthOption.placeholder = '0';
    }
    FormUtils.createLogFlagOption(section);
    const logLevelOption = field(form.ListValue, 'log_level', _('Log Level'));
    for (const level of ['debug', 'info', 'warn', 'error']) logLevelOption.value(level);
    logLevelOption.default = 'info';
    logLevelOption.rmempty = false;
}
