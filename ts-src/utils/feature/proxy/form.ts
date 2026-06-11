import fs from "fs";
import form from "form";
import uci from "uci";
import ui from "ui";
import { CORE_PROTOCOLS, CoreType, HijpassValues, LuciFlied, PROXY_TYPE, ProxyType } from "../../../enum/hijpass";
import { JsonUtils } from "../../base/files/json";
import { ValidationUtils } from "../../base/luci/validation";
import { ProxyConfigFileUtils } from "./config-file";

function loadProxyLog(logPath: string, contentEl: HTMLElement) {
    contentEl.textContent = _('Loading...');
    fs.exec('/usr/bin/tail', ['-n', '200', logPath])
        .then((result: any) => {
            let text = (result && result.stdout) ? result.stdout.trim() : '';
            text = text.replace(/\x1b\[[0-9;]*m/g, '');
            contentEl.textContent = text || _('No Logs');
            contentEl.scrollTop = contentEl.scrollHeight;
        })
        .catch(() => { contentEl.textContent = _('Read Failed'); });
}

function updateLatencyButton(el: HTMLElement, ms: number) {
    el.textContent = ms + 'ms';
    if (ms < 300) {
        el.style.backgroundColor = '#1a7a3a';
        el.style.borderColor = '#1a7a3a';
    } else if (ms < 500) {
        el.style.backgroundColor = '#7a6a00';
        el.style.borderColor = '#7a6a00';
    } else {
        el.style.backgroundColor = '#7a2020';
        el.style.borderColor = '#7a2020';
    }
}

function applyFilter(typeSelect: HTMLSelectElement, core: string): void {
    if (core === 'custom') return;
    const effectiveCore: CoreType = (core === 'xray') ? 'xray' : 'sing-box';
    const valid = CORE_PROTOCOLS[effectiveCore] ?? [];
    Array.from(typeSelect.options).forEach(
        (o: HTMLOptionElement) => (o.hidden = !valid.includes(o.value as ProxyType))
    );
    if (!valid.includes(typeSelect.value as ProxyType)) {
        typeSelect.value = PROXY_TYPE.SHADOWSOCKS;
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

const ProxyFormUtils = {
    renderProxyType: function (section_id: string) {
        let type = uci.get(LuciFlied.CONF_NAME, section_id, 'type');
        let coreValue = uci.get(LuciFlied.CONF_NAME, section_id, 'core') || 'custom'
        if (coreValue === 'custom') {
            return E('span', {}, _('自定义'));
        }
        let typeLabel = HijpassValues.PROXY_TYPES.find(t => t.value === type)?.label || type || '';
        let coreLabel = HijpassValues.DUAL_CORES.find(c => c.value === coreValue)?.label || coreValue;
        let coreTag = E('span', { style: 'opacity:0.55;font-size:0.82em;margin-left:4px' }, `(${coreLabel})`);
        return E('span', {}, [E('span', {}, _(typeLabel)), coreTag]);
    },

    renderProxyServerInfo: function (section_id: string) {
        let type = uci.get(LuciFlied.CONF_NAME, section_id, 'type') || PROXY_TYPE.CUSTOM;
        let server_name = uci.get(LuciFlied.CONF_NAME, section_id, 'tls_server_name');
        if (!server_name) {
            server_name = uci.get(LuciFlied.CONF_NAME, section_id, 'server');
        }
        let server_port = uci.get(LuciFlied.CONF_NAME, section_id, 'server_port');

        switch (type) {
            case PROXY_TYPE.CUSTOM: {
                let command = uci.get(LuciFlied.CONF_NAME, section_id, 'command');
                if (command && command.length > 50) {
                    return E('span', { title: command }, command.substring(0, 47) + '...');
                }
                return command || '';
            }
            case PROXY_TYPE.HYSTERIA2:
                return E('span', {}, server_name ? server_name + ':' + (server_port || '443') : _('Not Configured'));
            case PROXY_TYPE.SHADOWSOCKS: {
                let method = uci.get(LuciFlied.CONF_NAME, section_id, 'method');
                return E('span', {}, server_name ? server_name + ':' + (server_port || '-') + ' (' + (method || '-') + ')' : _('Not Configured'));
            }
            case PROXY_TYPE.TUIC: {
                let congestion = uci.get(LuciFlied.CONF_NAME, section_id, 'congestion_control');
                return E('span', {}, server_name ? server_name + ':' + (server_port || '-') + ' (' + (congestion || 'cubic') + ')' : _('Not Configured'));
            }
            case PROXY_TYPE.SHADOWTLS: {
                let version = uci.get(LuciFlied.CONF_NAME, section_id, 'version');
                return E('span', {}, server_name ? server_name + ':' + (server_port || '-') + ' (v' + (version || '1') + ')' : _('Not Configured'));
            }
            case PROXY_TYPE.VLESS: {
                let flow = uci.get(LuciFlied.CONF_NAME, section_id, 'flow');
                return E('span', {}, server_name ? server_name + ':' + (server_port || '-') + (flow ? ' (' + flow + ')' : '') : _('Not Configured'));
            }
            default:
                return '';
        }
    },

    renderRunStatus: function (section_id: string, instances: any) {
        const name = uci.get(LuciFlied.CONF_NAME, section_id, 'name');
        const instanceName = section_id + (name ? '-' + name : '');
        const running = instances?.[instanceName]?.running ?? false;
        return E('span', { style: 'color:' + (running ? 'green' : 'red') }, running ? _('Running') : _('Not Running'));
    },

    createGridActionButtons: function (section_id: string) {
        const btns: Node[] = [];

        let core = uci.get(LuciFlied.CONF_NAME, section_id, 'core');
        if (core !== 'custom') {
            btns.push(E('button', {
                class: 'btn cbi-button',
                style: 'background-color:#5a4a8a;border-color:#5a4a8a',
                click: function () {
                    let section = uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE)
                        .find((s: any) => s['.name'] === section_id);
                    if (!section) return;
                    let conf: {};
                    try {
                        conf = ProxyConfigFileUtils.generateProxyConfigFromSection(section)
                            || { error: _('Invalid proxy config') };
                    } catch (e: any) {
                        conf = { error: e.message };
                    }
                    let name = uci.get(LuciFlied.CONF_NAME, section_id, 'name') || section_id;
                    let contentEl = E('pre', {
                        style: 'max-height:500px;overflow:auto;padding:10px;border-radius:4px;white-space:pre;font-size:0.8em'
                    }, JSON.stringify(conf, JsonUtils.omitEmptyReplacer, 2)) as HTMLElement;
                    ui.showModal(name + ' - ' + _('Config Preview'), [
                        E('div', { class: 'cbi-section' }, [contentEl]),
                        E('div', { class: 'right' }, [
                            E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('关闭'))
                        ])
                    ]);
                }
            }, _('预览')));
        }

        let logPath = uci.get(LuciFlied.CONF_NAME, section_id, 'log_path');
        if (logPath) {
            let name = uci.get(LuciFlied.CONF_NAME, section_id, 'name') || section_id;
            btns.push(E('button', {
                class: 'btn cbi-button',
                style: 'background-color:#3d6b5e;border-color:#3d6b5e',
                click: function () {
                    let contentEl = E('pre', {
                        style: 'max-height:500px;overflow:auto;padding:10px;border-radius:4px;white-space:pre;font-size:0.8em'
                    }, '') as HTMLElement;
                    loadProxyLog(logPath, contentEl);
                    ui.showModal(name + ' - ' + _('Log'), [
                        E('div', { class: 'cbi-section' }, [contentEl]),
                        E('div', { class: 'right', style: 'display:flex;justify-content:flex-end;gap:10px' }, [
                            E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('关闭')),
                            E('button', { class: 'btn cbi-button-action', click: function () { loadProxyLog(logPath, contentEl); } }, _('刷新'))
                        ])
                    ]);
                }
            }, _('Log')));
        }

        let port = uci.get(LuciFlied.CONF_NAME, section_id, 'socks_port');
        let enabled = uci.get(LuciFlied.CONF_NAME, section_id, 'enabled');
        if (port && enabled !== '0') {
            btns.push(E('button', {
                class: 'btn cbi-button',
                'data-latency': port,
                style: 'background-color:#1a6a8a;border-color:#1a6a8a;min-width:70px',
                click: function (ev: MouseEvent) {
                    let el = ev.currentTarget as HTMLElement;
                    el.setAttribute('disabled', 'true');
                    el.textContent = '...';
                    el.style.backgroundColor = '#1a6a8a';
                    el.style.borderColor = '#1a6a8a';
                    fs.exec_direct('/usr/lib/hijpass/net.sh', ['ping', port], 'json')
                        .then((res: any) => {
                            if (res && res.ms != null) {
                                updateLatencyButton(el, res.ms);
                            } else {
                                el.textContent = _('Timeout');
                                el.style.backgroundColor = '#7a2020';
                                el.style.borderColor = '#7a2020';
                            }
                        })
                        .catch(() => {
                            el.textContent = _('Failed');
                            el.style.backgroundColor = '#7a2020';
                            el.style.borderColor = '#7a2020';
                        })
                        .finally(() => { el.removeAttribute('disabled'); });
                }
            }, _('Speed Test')));
        }

        return E('span', { style: 'display:flex;gap:8px;flex-wrap:nowrap' }, btns);
    },

    forProtocols: function (o: LuCI.form.AbstractValue, types: ProxyType[]): void {
        types.forEach(t => o.depends('type', t));
    },

    forCoreProtocols: function (o: LuCI.form.AbstractValue, core: CoreType, types: ProxyType[]): void {
        types.forEach(t => o.depends({ type: t, core }));
    },

    createCoreAndTypeOptions: function (s: LuCI.form.AbstractSection): void {
        let coreOpt = s.option(form.ListValue, 'core', _('Backend Core'),
            _('Select backend core for this proxy node'));
        coreOpt.modalonly = true;
        coreOpt.default = 'sing-box';
        coreOpt.rmempty = false;
        HijpassValues.DUAL_CORES.forEach(c => coreOpt.value(c.value, _(c.label)));

        let typeOpt = s.option(form.ListValue, 'type', _('Proxy Type'),
            _('Select Proxy Type'));
        typeOpt.modalonly = true;
        typeOpt.default = PROXY_TYPE.SHADOWSOCKS;
        typeOpt.rmempty = false;
        typeOpt.depends('core', 'xray');
        typeOpt.depends('core', 'sing-box');
        HijpassValues.PROXY_TYPES.forEach(t => typeOpt.value(t.value, _(t.label)));

        typeOpt.renderWidget = function (section_id: string, option_index: number, cfgvalue: string): Node {
            const widget = form.ListValue.prototype.renderWidget.call(
                this, section_id, option_index, cfgvalue) as HTMLElement;
            const typeSelect = widget.querySelector('select') as HTMLSelectElement;

            setTimeout(() => {
                const coreEl = document.getElementById(coreOpt.cbid(section_id));
                const coreSelect = coreEl?.querySelector('select') as HTMLSelectElement | null;
                if (!coreSelect) return;
                applyFilter(typeSelect, coreSelect.value);
                if (!coreSelect.dataset['filterAttached']) {
                    coreSelect.dataset['filterAttached'] = '1';
                    coreSelect.addEventListener('change', () => applyFilter(typeSelect, coreSelect.value));
                }
            }, 0);

            return widget;
        };
    },

    createProxyPortOptions: function (s: LuCI.form.AbstractSection) {
        let listenInp: HTMLInputElement | null = null;
        let socksInp: HTMLInputElement | null = null;

        let listenPortOpt = s.option(form.Value, 'listen_port', _('Local Listen Port'),
            _('Local Transparent Proxy Listen Port'));
        listenPortOpt.datatype = 'port';
        listenPortOpt.rmempty = false;
        listenPortOpt.modalonly = true;
        listenPortOpt.validate = function (sectionId: string, value: string) {
            let socks_port = uci.get(LuciFlied.CONF_NAME, sectionId, "socks_port");
            if (socks_port === value) {
                return _("Conflicts with SOCKS Port")
            }
            return ValidationUtils.validatePortConflict.call(this, sectionId, value);
        }
        listenPortOpt.load = function (section_id: string) {
            let value = form.Value.prototype.load.call(this, section_id);
            if (value) {
                return value;
            }
            let port = ValidationUtils.findAvailablePort(7890)
            form.Value.prototype.write.call(this, section_id, port);
            return port.toString();
        };
        listenPortOpt.renderWidget = function (section_id: string, option_index: number, cfgvalue: any) {
            let input = form.Value.prototype.renderWidget.call(this, section_id, option_index, cfgvalue) as HTMLElement;
            listenInp = input.querySelector('input') as HTMLInputElement;
            let btn = E('button', {
                class: 'btn cbi-button',
                style: 'margin-left:6px',
                type: 'button',
                click: function () {
                    let current = Number(listenInp.value);
                    let usedPorts = ValidationUtils.getUsedPortsExcluding(section_id);
                    let siblingPort = socksInp ? Number(socksInp.value) : 0;
                    if (siblingPort) usedPorts.push(siblingPort);
                    if (current && !usedPorts.includes(current)) return;
                    let port = siblingPort ? siblingPort + 1 : 7890;
                    while (usedPorts.includes(port)) port++;
                    listenInp.value = port.toString();
                    listenInp.dispatchEvent(new Event('input', { bubbles: true }));
                    listenInp.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, _('Auto Generate'));
            return E('div', { style: 'display:flex;align-items:center' }, [input, btn]);
        };

        let socksPortOpt = s.option(form.Value, 'socks_port', _('Local SOCKS Port'),
            _('Local SOCKS Listen Port'));
        socksPortOpt.datatype = 'port';
        socksPortOpt.rmempty = false;
        socksPortOpt.modalonly = true;
        socksPortOpt.validate = function (sectionId: string, value: string) {
            let listen_port = uci.get(LuciFlied.CONF_NAME, sectionId, "listen_port");
            if (listen_port === value) {
                return _("Conflicts with Transparent Proxy Port")
            }
            return ValidationUtils.validatePortConflict.call(this, sectionId, value);
        }
        socksPortOpt.load = function (section_id: string) {
            let value = form.Value.prototype.load.call(this, section_id);
            if (value) {
                return value;
            }
            let port = ValidationUtils.findAvailablePort(7891)
            form.Value.prototype.write.call(this, section_id, port);
            return port.toString();
        };
        socksPortOpt.renderWidget = function (section_id: string, option_index: number, cfgvalue: any) {
            let input = form.Value.prototype.renderWidget.call(this, section_id, option_index, cfgvalue) as HTMLElement;
            socksInp = input.querySelector('input') as HTMLInputElement;
            let btn = E('button', {
                class: 'btn cbi-button',
                style: 'margin-left:6px',
                type: 'button',
                click: function () {
                    let current = Number(socksInp.value);
                    let usedPorts = ValidationUtils.getUsedPortsExcluding(section_id);
                    let siblingPort = listenInp ? Number(listenInp.value) : 0;
                    if (siblingPort) usedPorts.push(siblingPort);
                    if (current && !usedPorts.includes(current)) return;
                    let port = siblingPort ? siblingPort + 1 : 7891;
                    while (usedPorts.includes(port)) port++;
                    socksInp.value = port.toString();
                    socksInp.dispatchEvent(new Event('input', { bubbles: true }));
                    socksInp.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, _('Auto Generate'));
            return E('div', { style: 'display:flex;align-items:center' }, [input, btn]);
        };
    },
}

export { ProxyFormUtils }
