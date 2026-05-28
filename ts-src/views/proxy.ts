import view from "view";
import uci from "uci";
import { LuciFlied, HijpassValues, PROXY_TYPE, CoreType, ProxyType, CORE_PROTOCOLS } from "../enum/hijpass";
import form from "form";
import { LuciUtils, WebUtils, ProxyUtils, ShuntUtils } from "../utils/common";
import { LuciConverterFactory, FactoryType } from "../utils/factory";
import fs from "fs";
import ui from "ui";

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME),
            LuciUtils.getServiceInstances(LuciFlied.CONF_NAME)
        ]);
    },

    handleSaveApply: LuciUtils.genHandleSaveApply(),
    handleSave: function (ev?: Event) {
        return view.prototype.handleSave.call(this, ev);
    },
    render: async function (data: any[]) {
        let m = new form.Map(LuciFlied.CONF_NAME, _('Proxy Settings'),
            _('Configure Proxy Settings'));
        let s = m.section(form.GridSection, LuciFlied.PROXY_NODE_TYPE)
        WebUtils.setAnonymousGridSectionMembers(s);

        // 重写 handleAdd 方法，使用自定义的唯一 ID 生成器
        s.handleAdd = function (ev: Event, name?: string) {
            let sectionId = WebUtils.generateUniqueSectionId();
            return L.bind(form.GridSection.prototype.handleAdd, this, ev, sectionId)();
        };
        s.handleRemove = function (ev: Event, name?: string) {
            return form.GridSection.prototype.handleRemove.call(this, ev, name);
        };
        const instances = data[1] ?? {};
        createProxyOptions(s, instances);

        return m.render();
    },
});

/**
 * 创建启用状态选项
 */
function createEnabledOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Flag, 'enabled', _('Enable'), _(''));
    o.modalonly = true;
    o.default = '1';
    o.rmempty = false;
    return o;
}

/**
 * 创建节点名称编辑选项
 */
function createNodeNameOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Value, 'name', _('Node Name'),
        _('Modify Proxy Node Name'));
    o.modalonly = true;
    o.validate = WebUtils.createTagValidator(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, 'name')
    return o;
}

/**
 * 创建Grid表格显示选项
 */
function createGridDisplayOptions(s: LuCI.form.AbstractSection, instances: any) {
    let typeOpt = s.option(form.TextValue, 'type', _('Type'), _('Proxy Type'));
    typeOpt.modalonly = false;
    typeOpt.textvalue = function (section_id: string) {
        let type = uci.get(LuciFlied.CONF_NAME, section_id, 'type');
        // 向后兼容：旧节点无 core 字段，从 type 推断
        let coreValue = uci.get(LuciFlied.CONF_NAME, section_id, 'core') || 'custom'
        if (coreValue === 'custom') {
            return E('span', {}, _('自定义'));
        }
        let typeLabel = HijpassValues.PROXY_TYPES.find(t => t.value === type)?.label || type || '';
        let coreLabel = HijpassValues.DUAL_CORES.find(c => c.value === coreValue)?.label || coreValue;
        let coreTag = E('span', { style: 'opacity:0.55;font-size:0.82em;margin-left:4px' }, `(${coreLabel})`);
        return E('span', {}, [E('span', {}, _(typeLabel)), coreTag]);
    };

    // 显示服务器信息（不同类型显示不同内容）
    let serverInfoOpt = s.option(form.TextValue, 'server_info', _('Configuration Info'), _(''));
    serverInfoOpt.modalonly = false;
    serverInfoOpt.textvalue = function (section_id: string) {
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
    };

    // 运行状态列
    let statusOpt = s.option(form.TextValue, 'run_status', _('Status'), _(''));
    statusOpt.modalonly = false;
    statusOpt.textvalue = function (section_id: string) {
        const name = uci.get(LuciFlied.CONF_NAME, section_id, 'name');
        const instanceName = section_id + (name ? '-' + name : '');
        const running = instances?.[instanceName]?.running ?? false;
        return E('span', { style: 'color:' + (running ? 'green' : 'red') }, running ? _('Running') : _('Not Running'));
    };

    // 启用状态（在表格中显示并可直接修改）
    let enabledOpt = createEnabledOption(s);
    enabledOpt.editable = true;
    enabledOpt.modalonly = false;

    // 操作列：预览 / 日志 / 测速，三个按钮合并在一列
    let actionsOpt = s.option(form.TextValue, 'actions', _(''));
    actionsOpt.modalonly = false;
    actionsOpt.textvalue = function (section_id: string) {
        const btns: Node[] = [];

        // ── 配置预览 ──────────────────────────────────────────────────────
        let core = uci.get(LuciFlied.CONF_NAME, section_id, 'core');
        if (core !== 'custom') {
            btns.push(E('button', {
                class: 'btn cbi-button',
                style: 'background-color:#5a4a8a;border-color:#5a4a8a',
                click: function () {
                    let section = uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE)
                        .find((s: any) => s['.name'] === section_id);
                    if (!section) return;
                    let proxyConfig = ProxyUtils.createProxyConfigFromSection(section);
                    if (!proxyConfig) return;
                    let conf: {};
                    try {
                        let factoryType = proxyConfig.core === 'xray' ? FactoryType.XRAY : FactoryType.SING_BOX;
                        conf = LuciConverterFactory.genProxyConf(factoryType, proxyConfig);
                    } catch (e: any) {
                        conf = { error: e.message };
                    }
                    let name = uci.get(LuciFlied.CONF_NAME, section_id, 'name') || section_id;
                    let contentEl = E('pre', {
                        style: 'max-height:500px;overflow:auto;padding:10px;border-radius:4px;white-space:pre;font-size:0.8em'
                    }, JSON.stringify(conf, ShuntUtils.omitEmptyReplacer, 2)) as HTMLElement;
                    ui.showModal(name + ' - ' + _('Config Preview'), [
                        E('div', { class: 'cbi-section' }, [contentEl]),
                        E('div', { class: 'right' }, [
                            E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('关闭'))
                        ])
                    ]);
                }
            }, _('预览')));
        }

        // ── 日志查看 ──────────────────────────────────────────────────────
        let logPath = uci.get(LuciFlied.CONF_NAME, section_id, 'log_path');
        if (logPath) {
            let name = uci.get(LuciFlied.CONF_NAME, section_id, 'name') || section_id;
            function loadLog(contentEl: HTMLElement) {
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
            btns.push(E('button', {
                class: 'btn cbi-button',
                style: 'background-color:#3d6b5e;border-color:#3d6b5e',
                click: function () {
                    let contentEl = E('pre', {
                        style: 'max-height:500px;overflow:auto;padding:10px;border-radius:4px;white-space:pre;font-size:0.8em'
                    }, '') as HTMLElement;
                    loadLog(contentEl);
                    ui.showModal(name + ' - ' + _('Log'), [
                        E('div', { class: 'cbi-section' }, [contentEl]),
                        E('div', { class: 'right', style: 'display:flex;justify-content:flex-end;gap:10px' }, [
                            E('button', { class: 'btn cbi-button', click: ui.hideModal }, _('关闭')),
                            E('button', { class: 'btn cbi-button-action', click: function () { loadLog(contentEl); } }, _('刷新'))
                        ])
                    ]);
                }
            }, _('Log')));
        }

        // ── 延迟测速（最右）────────────────────────────────────────────────
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
                                el.textContent = res.ms + 'ms';
                                if (res.ms < 300) {
                                    el.style.backgroundColor = '#1a7a3a';
                                    el.style.borderColor = '#1a7a3a';
                                } else if (res.ms < 500) {
                                    el.style.backgroundColor = '#7a6a00';
                                    el.style.borderColor = '#7a6a00';
                                } else {
                                    el.style.backgroundColor = '#7a2020';
                                    el.style.borderColor = '#7a2020';
                                }
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
    };
}

/**
 * 创建自定义代理的特定选项
 */
function createCustomProxyOptions(s: LuCI.form.AbstractSection) {
    // 运行命令，{conf_path} 为配置文件路径占位符
    let cmdOpt = s.option(form.Value, 'command', _('Run Command'),
        _('Proxy Run Command'));
    cmdOpt.default = '/usr/bin/xray -c {conf_path}';
    cmdOpt.rmempty = false;
    cmdOpt.modalonly = true;
    cmdOpt.depends('core', 'custom');

    // 配置文件内容编辑器，路径自动生成为 $client_dir/$name-$section_id.json
    let confOpt = s.option(form.TextValue, 'custom_conf', _('Configuration File Content'),
        _('Edit Configuration File'));
    confOpt.modalonly = true;
    confOpt.depends('core', 'custom');
    WebUtils.setConfContentOptionMembers(confOpt, LuciFlied.CONF_NAME, WebUtils.getFilePath('client_dir'));
}

/**
 * 创建代理监听端口选项（所有代理类型通用）
 */
function createProxyPortOptions(s: LuCI.form.AbstractSection) {
    // 两个 input 的直接引用，renderWidget 执行时赋值
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
        return WebUtils.validatePortConflict.call(this, sectionId, value);
    }
    listenPortOpt.load = function (section_id: string) {
        let value = form.Value.prototype.load.call(this, section_id);
        if (value) {
            return value;
        }
        let port = WebUtils.findAvailablePort(7890)
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
                let usedPorts = WebUtils.getUsedPortsExcluding(section_id);
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
        return WebUtils.validatePortConflict.call(this, sectionId, value);
    }
    socksPortOpt.load = function (section_id: string) {
        let value = form.Value.prototype.load.call(this, section_id);
        if (value) {
            return value;
        }
        let port = WebUtils.findAvailablePort(7891)
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
                let usedPorts = WebUtils.getUsedPortsExcluding(section_id);
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
}

/**
 * 创建自定义代理的环境变量和日志选项
 */
function createProxyEnvironmentOptions(s: LuCI.form.AbstractSection) {
    let procdEnvOpt = s.option(form.DynamicList, 'procd_env', _('Procd Environment Variables'),
        _('Procd Environment Variables'));
    procdEnvOpt.modalonly = true;

    WebUtils.createLogFlagOption(s, LuciFlied.CONF_NAME, undefined)
}


/**
 * 创建通用的服务器地址和端口选项（用于所有需要server/server_port的协议）
 */
function createCommonServerOptions(s: LuCI.form.AbstractSection) {
    let serverAddrOpt = s.option(form.Value, 'server', _('Server Address'),
        _('Proxy Server Address'));
    serverAddrOpt.modalonly = true;
    serverAddrOpt.rmempty = false;
    forProtocols(serverAddrOpt, [PROXY_TYPE.HYSTERIA2, PROXY_TYPE.SHADOWSOCKS,
    PROXY_TYPE.TUIC, PROXY_TYPE.SHADOWTLS, PROXY_TYPE.VLESS]);

    let serverPortOpt = s.option(form.Value, 'server_port', _('Server Port'),
        _('Proxy Server Port'));
    serverPortOpt.datatype = 'port';
    serverPortOpt.modalonly = true;
    serverPortOpt.rmempty = false;
    forProtocols(serverPortOpt, [PROXY_TYPE.HYSTERIA2, PROXY_TYPE.SHADOWSOCKS,
    PROXY_TYPE.TUIC, PROXY_TYPE.SHADOWTLS, PROXY_TYPE.VLESS]);
}

/**
 * 创建Hysteria2代理的高级选项（sing-box 核心独有）
 */
function createHysteria2AdvancedOptions(s: LuCI.form.AbstractSection) {
    let serverPortsOpt = s.option(form.DynamicList, 'server_ports', _('Port Hopping'),
        _('Port Hopping Range'));
    serverPortsOpt.modalonly = true;
    serverPortsOpt.datatype = 'portrange';
    serverPortsOpt.depends({ type: PROXY_TYPE.HYSTERIA2, core: 'singbox' });

    let hopIntervalOpt = s.option(form.Value, 'hop_interval', _('Port Hop Interval'),
        _('Port Hop Interval'));
    hopIntervalOpt.modalonly = true;
    // hop_interval 依赖于类型是 Hysteria2 且 server_ports 有值
    hopIntervalOpt.depends({ type: PROXY_TYPE.HYSTERIA2, core: 'singbox', server_ports: /./ });

    let upMbpsOpt = s.option(form.Value, 'up_mbps', _('Uplink Speed'),
        _('Maximum Uplink Bandwidth'));
    upMbpsOpt.datatype = 'uinteger';
    upMbpsOpt.modalonly = true;
    upMbpsOpt.depends({ type: PROXY_TYPE.HYSTERIA2, core: 'singbox' });

    let downMbpsOpt = s.option(form.Value, 'down_mbps', _('Downlink Speed'),
        _('Maximum Downlink Bandwidth'));
    downMbpsOpt.datatype = 'uinteger';
    downMbpsOpt.modalonly = true;
    downMbpsOpt.depends({ type: PROXY_TYPE.HYSTERIA2, core: 'singbox' });
}

/**
 * 创建Hysteria2代理的Xray核心独有选项
 */
function createHysteria2XrayOptions(s: LuCI.form.AbstractSection) {
    let udpIdleTimeoutOpt = s.option(form.Value, 'udp_idle_timeout', _('UDP Idle Timeout'),
        _('UDP connection idle timeout in seconds'));
    udpIdleTimeoutOpt.datatype = 'uinteger';
    udpIdleTimeoutOpt.modalonly = true;
    udpIdleTimeoutOpt.placeholder = '60';
    udpIdleTimeoutOpt.depends({ type: PROXY_TYPE.HYSTERIA2, core: 'xray' });
}

/**
 * 创建Hysteria2代理的OBFS选项（sing-box 核心独有）
 */
function createHysteria2ObfsOptions(s: LuCI.form.AbstractSection) {
    let obfsTypeOpt = s.option(form.ListValue, 'obfs_type', _('OBFS Type'),
        _('QUIC Obfuscation Type'));
    obfsTypeOpt.modalonly = true;
    obfsTypeOpt.depends({ type: PROXY_TYPE.HYSTERIA2, core: 'singbox' });

    HijpassValues.HYSTERIA2_OBFS_TYPES.forEach((item) => {
        obfsTypeOpt.value(item.value, _(item.label));
    });

    let obfsPasswordOpt = s.option(form.Value, 'obfs_password', _('OBFS Password'),
        _('QUIC Obfuscation Password'));
    obfsPasswordOpt.modalonly = true;
    obfsPasswordOpt.depends({ type: PROXY_TYPE.HYSTERIA2, core: 'singbox', obfs_type: 'salamander' });
}

/**
 * 创建VLESS代理的网络和packet_encoding选项
 * packet_encoding 只对 sing-box core 显示（xray 的 VLESS 不支持该字段）
 */
function createVlessNetworkOptions(s: LuCI.form.AbstractSection) {
    let packetEncodingOpt = s.option(form.ListValue, 'packet_encoding', _('UDP Packet Encoding'),
        _('UDP Packet Encoding Method'));
    packetEncodingOpt.modalonly = true;
    // packet_encoding 只对 sing-box core 有意义
    packetEncodingOpt.depends({ type: PROXY_TYPE.VLESS, core: 'singbox' });

    HijpassValues.VLESS_PACKET_ENCODINGS.forEach((item) => {
        packetEncodingOpt.value(item.value, item.label);
    });
}

/**
 * 创建通用传输层类型选择（用于支持Transport的协议：VLESS等）
 * - 所有传输类型统一注册（含 xhttp）
 * - sing-box 不支持 xhttp：通过 validate 校验阻止 singbox+xhttp 的非法组合
 * - xhttp 相关子字段仅在 core:xray 时显示
 */
function createTransportTypeOption(s: LuCI.form.AbstractSection) {
    let transportOpt = s.option(form.ListValue, 'transport_type', _('Transport Protocol'),
        _('Proxy Transport Protocol'));
    transportOpt.modalonly = true;
    transportOpt.depends('type', PROXY_TYPE.VLESS);

    HijpassValues.V2RAY_TRANSPORT_TYPES_XRAY.forEach((item) => {
        transportOpt.value(item.value, item.label);
    });

    // sing-box 不支持 xhttp
    // 用 this.section.formvalue 读取表单中 core 字段的当前值（未保存的实时值），
    // 而非 uci.get（那只能读到上次保存的旧值）
    transportOpt.validate = function (sectionId: string, value: string) {
        if (value === 'xhttp') {
            let core = (this as any).section.formvalue(sectionId, 'core');
            if (core !== 'xray') {
                return _('XHTTP transport is only supported by Xray core');
            }
        }
        return true;
    };
}

/**
 * 创建通用的HTTP传输选项（用于支持Transport的协议：VLESS等）
 */
function createTransportHttpOptions(s: LuCI.form.AbstractSection) {
    let hostOpt = s.option(form.Value, 'transport_http_host', _('HTTP Host'),
        _('HTTP Host List'));
    hostOpt.modalonly = true;
    hostOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'http' });

    let pathOpt = s.option(form.Value, 'transport_http_path', _('HTTP Path'),
        _('HTTP Request Path'));
    pathOpt.modalonly = true;
    pathOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'http' });

    let methodOpt = s.option(form.Value, 'transport_http_method', _('HTTP Method'),
        _('HTTP Request Method'));
    methodOpt.modalonly = true;
    methodOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'http' });

    let idleOpt = s.option(form.Value, 'transport_http_idle_timeout', _('Idle Timeout'),
        _('Idle Timeout'));
    idleOpt.modalonly = true;
    idleOpt.default = '15s';
    idleOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'http' });

    let pingOpt = s.option(form.Value, 'transport_http_ping_timeout', _('PING Timeout'),
        _('PING Response Timeout'));
    pingOpt.modalonly = true;
    pingOpt.default = '15s';
    pingOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'http' });
}

/**
 * 创建通用的WebSocket传输选项（用于支持Transport的协议：VLESS等）
 */
function createTransportWsOptions(s: LuCI.form.AbstractSection) {
    let pathOpt = s.option(form.Value, 'transport_ws_path', _('WebSocket Path'),
        _('HTTP Request Path'));
    pathOpt.modalonly = true;
    pathOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'ws' });

    let earlyDataOpt = s.option(form.Value, 'transport_ws_max_early_data', _('Max Early Data'),
        _('请求中允许的最大有效负载大小'));
    earlyDataOpt.datatype = 'uinteger';
    earlyDataOpt.modalonly = true;
    earlyDataOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'ws' });

    let headerNameOpt = s.option(form.Value, 'transport_ws_early_data_header_name', _('Early Data Header Name'),
        _('Early Data Header Name'));
    headerNameOpt.modalonly = true;
    headerNameOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'ws' });
}

/**
 * 创建通用的gRPC传输选项（用于支持Transport的协议：VLESS等）
 */
function createTransportGrpcOptions(s: LuCI.form.AbstractSection) {
    let serviceOpt = s.option(form.Value, 'transport_grpc_service_name', _('gRPC Service Name'),
        _('gRPC Service Name'));
    serviceOpt.modalonly = true;
    serviceOpt.default = 'TunService';
    serviceOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'grpc' });

    let idleOpt = s.option(form.Value, 'transport_grpc_idle_timeout', _('Idle Timeout'),
        _('Idle Timeout'));
    idleOpt.modalonly = true;
    idleOpt.default = '15s';
    idleOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'grpc' });

    let pingOpt = s.option(form.Value, 'transport_grpc_ping_timeout', _('PING Timeout'),
        _('PING Response Timeout'));
    pingOpt.modalonly = true;
    pingOpt.default = '15s';
    pingOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'grpc' });

    let permitOpt = s.option(form.Flag, 'transport_grpc_permit_without_stream', _('Permit Without Stream'),
        _('Send Keepalive Ping'));
    permitOpt.modalonly = true;
    permitOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'grpc' });
}

/**
 * 创建通用的HTTPUpgrade传输选项（用于支持Transport的协议：VLESS等）
 */
function createTransportHttpupgradeOptions(s: LuCI.form.AbstractSection) {
    let hostOpt = s.option(form.Value, 'transport_httpupgrade_host', _('HTTPUpgrade Host'),
        _('Host Domain'));
    hostOpt.modalonly = true;
    hostOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'httpupgrade' });

    let pathOpt = s.option(form.Value, 'transport_httpupgrade_path', _('HTTPUpgrade Path'),
        _('HTTP Request Path'));
    pathOpt.modalonly = true;
    pathOpt.depends({ type: PROXY_TYPE.VLESS, transport_type: 'httpupgrade' });
}

/**
 * 创建通用TLS配置选项（用于支持TLS的协议：Hysteria2、TUIC、ShadowTLS、VLESS）
 */
function createCommonTlsOptions(s: LuCI.form.AbstractSection) {
    let serverNameOpt = s.option(form.Value, 'tls_server_name', _('TLS Server Name'),
        _('TLS Server Name'));
    serverNameOpt.modalonly = true;
    serverNameOpt.rmempty = false;
    forProtocols(serverNameOpt, [PROXY_TYPE.HYSTERIA2, PROXY_TYPE.TUIC,
    PROXY_TYPE.SHADOWTLS, PROXY_TYPE.VLESS]);

    let insecureOpt = s.option(form.Flag, 'tls_insecure', _('Ignore Certificate Verification'),
        _('Accept Any Certificate'));
    insecureOpt.modalonly = true;
    forProtocols(insecureOpt, [PROXY_TYPE.HYSTERIA2, PROXY_TYPE.TUIC,
    PROXY_TYPE.SHADOWTLS, PROXY_TYPE.VLESS]);
}

/**
 * 创建TLS Reality配置选项（用于支持Reality的协议：VLESS等）
 */
function createTlsRealityOptions(s: LuCI.form.AbstractSection) {
    let realityEnabledOpt = s.option(form.Flag, 'tls_reality_enabled', _('Enable TLS Reality'),
        _('Enable TLS Reality Obfuscation'));
    realityEnabledOpt.modalonly = true;
    realityEnabledOpt.depends('type', PROXY_TYPE.VLESS);

    let publicKeyOpt = s.option(form.Value, 'tls_reality_public_key', _('Reality Public Key'),
        _('Server Reality Public Key'));
    publicKeyOpt.modalonly = true;
    publicKeyOpt.depends({ type: PROXY_TYPE.VLESS, tls_reality_enabled: '1' });

    let shortIdOpt = s.option(form.Value, 'tls_reality_short_id', _('Reality Short ID'),
        _('Server Reality Short ID'));
    shortIdOpt.modalonly = true;
    shortIdOpt.depends({ type: PROXY_TYPE.VLESS, tls_reality_enabled: '1' });
}

/**
 * 创建Hysteria2代理的调试选项（sing-box 核心独有）
 */
function createHysteria2DebugOptions(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Flag, 'brutal_debug', _('Enable Brutal CC Debug'),
        _('Enable Hysteria Brutal CC Debug'));
    o.modalonly = true;
    o.depends({ type: PROXY_TYPE.HYSTERIA2, core: 'singbox' });
}

function createNetworkOption(s: LuCI.form.AbstractSection) {
    let networkOpt = s.option(form.ListValue, 'network', _('Network Protocol'),
        _('Enabled Network Protocols'));
    networkOpt.modalonly = true;
    networkOpt.default = '';
    networkOpt.value('', '默认');
    networkOpt.value('tcp', 'TCP');
    networkOpt.value('udp', 'UDP');
    forProtocols(networkOpt, [PROXY_TYPE.HYSTERIA2, PROXY_TYPE.SHADOWSOCKS,
    PROXY_TYPE.TUIC, PROXY_TYPE.VLESS]);
}

function createPasswordOption(s: LuCI.form.AbstractSection) {
    let passwordOpt = s.option(form.Value, 'password', _('Password'),
        _('Authentication Password'));
    passwordOpt.modalonly = true;
    passwordOpt.password = true;
    passwordOpt.rmempty = false;
    forProtocols(passwordOpt, [PROXY_TYPE.HYSTERIA2, PROXY_TYPE.SHADOWSOCKS, PROXY_TYPE.TUIC]);
    // ShadowTLS v2/v3 only — compound depends, must stay separate
    passwordOpt.depends({ type: PROXY_TYPE.SHADOWTLS, version: '2' });
    passwordOpt.depends({ type: PROXY_TYPE.SHADOWTLS, version: '3' });
}

function createUuidOption(s: LuCI.form.AbstractSection) {
    let uuidOpt = s.option(form.Value, 'uuid', _('UUID'), _('User UUID'));
    uuidOpt.modalonly = true;
    uuidOpt.rmempty = false;
    forProtocols(uuidOpt, [PROXY_TYPE.VLESS, PROXY_TYPE.TUIC]);
}

function createMultiplexOptions(s: LuCI.form.AbstractSection) {
    const muxTypes: ProxyType[] = [PROXY_TYPE.SHADOWSOCKS, PROXY_TYPE.VLESS];

    let enabledOpt = s.option(form.Flag, 'multiplex_enabled', _('Enable Multiplexing'),
        _('Enable Multiplexing for Better Efficiency'));
    enabledOpt.modalonly = true;
    forCoreProtocols(enabledOpt, 'singbox', muxTypes);

    let protocolOpt = s.option(form.ListValue, 'multiplex_protocol', _('Multiplexing Protocol'),
        _('Multiplexing Protocol'));
    protocolOpt.modalonly = true;
    protocolOpt.default = 'h2mux';
    muxTypes.forEach(t => protocolOpt.depends({ type: t, core: 'singbox', multiplex_enabled: '1' }));
    HijpassValues.MULTIPLEX_PROTOCOLS.forEach(item => protocolOpt.value(item.value, item.label));

    let maxConnOpt = s.option(form.Value, 'multiplex_max_connections', _('Max Connections'),
        _('Max Connections'));
    maxConnOpt.datatype = 'uinteger';
    maxConnOpt.modalonly = true;
    muxTypes.forEach(t => maxConnOpt.depends({ type: t, core: 'singbox', multiplex_enabled: '1' }));

    let minStreamsOpt = s.option(form.Value, 'multiplex_min_streams', _('Min Streams'),
        _('Min Concurrent Streams'));
    minStreamsOpt.datatype = 'uinteger';
    minStreamsOpt.modalonly = true;
    muxTypes.forEach(t => minStreamsOpt.depends({ type: t, core: 'singbox', multiplex_enabled: '1' }));

    let maxStreamsOpt = s.option(form.Value, 'multiplex_max_streams', _('Max Streams'),
        _('Max Concurrent Streams'));
    maxStreamsOpt.datatype = 'uinteger';
    maxStreamsOpt.modalonly = true;
    muxTypes.forEach(t => maxStreamsOpt.depends({ type: t, core: 'singbox', multiplex_enabled: '1' }));

    let brutalEnabledOpt = s.option(form.Flag, 'multiplex_brutal_enabled', _('Enable TCP Brutal'),
        _('Enable TCP Brutal Congestion Control'));
    brutalEnabledOpt.modalonly = true;
    muxTypes.forEach(t => brutalEnabledOpt.depends({ type: t, core: 'singbox', multiplex_enabled: '1' }));

    let brutalUpOpt = s.option(form.Value, 'multiplex_brutal_up_mbps', _('Uplink Bandwidth'),
        _('Uplink Bandwidth'));
    brutalUpOpt.datatype = 'uinteger';
    brutalUpOpt.modalonly = true;
    muxTypes.forEach(t => brutalUpOpt.depends({ type: t, core: 'singbox', multiplex_enabled: '1', multiplex_brutal_enabled: '1' }));

    let brutalDownOpt = s.option(form.Value, 'multiplex_brutal_down_mbps', _('Downlink Bandwidth'),
        _('Downlink Bandwidth'));
    brutalDownOpt.datatype = 'uinteger';
    brutalDownOpt.modalonly = true;
    muxTypes.forEach(t => brutalDownOpt.depends({ type: t, core: 'singbox', multiplex_enabled: '1', multiplex_brutal_enabled: '1' }));
}

/**
 * 创建Shadowsocks代理的加密和密码选项
 */
function createShadowsocksEncryptionOptions(s: LuCI.form.AbstractSection) {
    let methodOpt = s.option(form.ListValue, 'method', _('Encryption Method'),
        _('Shadowsocks Encryption Method'));
    methodOpt.modalonly = true;
    methodOpt.rmempty = false;
    methodOpt.default = '2022-blake3-aes-256-gcm';
    methodOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);

    HijpassValues.SHADOWSOCKS_METHODS.forEach((item) => {
        methodOpt.value(item.value, item.label);
    });
}

/**
 * 创建Shadowsocks代理的插件选项
 */
function createShadowsocksPluginOptions(s: LuCI.form.AbstractSection) {
    let pluginOpt = s.option(form.ListValue, 'plugin', _('Plugin'),
        _('Shadowsocks SIP003 Plugin'));
    pluginOpt.modalonly = true;
    pluginOpt.value('', _('无'));
    pluginOpt.value('obfs-local', 'obfs-local');
    pluginOpt.value('v2ray-plugin', 'v2ray-plugin');
    pluginOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);

    let pluginOptsOpt = s.option(form.Value, 'plugin_opts', _('Plugin Options'),
        _('Shadowsocks SIP003 Plugin Options'));
    pluginOptsOpt.modalonly = true;
    // plugin_opts 依赖于类型是 Shadowsocks 且 plugin 有值
    pluginOptsOpt.depends({ type: PROXY_TYPE.SHADOWSOCKS, plugin: /./ });
}

/**
 * 创建Shadowsocks代理的网络选项
 */
function createShadowsocksNetworkOptions(s: LuCI.form.AbstractSection) {
    let udpOverTcpOpt = s.option(form.Flag, 'udp_over_tcp', _('UDP over TCP'),
        _('Enable UDP over TCP'));
    udpOverTcpOpt.modalonly = true;
    udpOverTcpOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);
}

/**
 * 创建TUIC代理的高级选项
 */
function createTuicAdvancedOptions(s: LuCI.form.AbstractSection) {
    let congestionOpt = s.option(form.ListValue, 'congestion_control', _('Congestion Control'),
        _('QUIC Congestion Control'));
    congestionOpt.modalonly = true;
    congestionOpt.default = 'cubic';
    congestionOpt.depends('type', PROXY_TYPE.TUIC);

    HijpassValues.TUIC_CONGESTION_CONTROLS.forEach((item) => {
        congestionOpt.value(item.value, item.label);
    });

    let udpRelayOpt = s.option(form.ListValue, 'udp_relay_mode', _('UDP Relay Mode'),
        _('UDP Packet Relay Mode'));
    udpRelayOpt.modalonly = true;
    udpRelayOpt.default = '';
    // udp_relay_mode 依赖于 udp_over_stream 未启用
    udpRelayOpt.depends({ type: PROXY_TYPE.TUIC, udp_over_stream: '0' });

    udpRelayOpt.value('', _('无'));
    HijpassValues.TUIC_UDP_RELAY_MODES.forEach((item) => {
        udpRelayOpt.value(item.value, item.label);
    });

    let udpOverStreamOpt = s.option(form.Flag, 'udp_over_stream', _('UDP over Stream'),
        _('Use UDP Stream Relay'));
    udpOverStreamOpt.modalonly = true;
    udpOverStreamOpt.depends('type', PROXY_TYPE.TUIC);

    let zero_rttOpt = s.option(form.Flag, 'zero_rtt_handshake', _('0-RTT Handshake'),
        _('Enable 0-RTT QUIC Handshake'));
    zero_rttOpt.modalonly = true;
    zero_rttOpt.depends('type', PROXY_TYPE.TUIC);

    let heartbeatOpt = s.option(form.Value, 'heartbeat', _('Heartbeat Interval'),
        _('Heartbeat Interval'));
    heartbeatOpt.modalonly = true;
    heartbeatOpt.default = '10s';
    heartbeatOpt.depends('type', PROXY_TYPE.TUIC);
}

/**
 * 创建ShadowTLS代理的版本和密码选项
 */
function createShadowTLSAuthOptions(s: LuCI.form.AbstractSection) {
    let versionOpt = s.option(form.ListValue, 'version', _('Protocol Version'),
        _('ShadowTLS Protocol Version'));
    versionOpt.modalonly = true;
    versionOpt.default = '1';
    versionOpt.depends('type', PROXY_TYPE.SHADOWTLS);

    HijpassValues.SHADOWTLS_VERSIONS.forEach((item) => {
        versionOpt.value(item.value, item.label);
    });
}

/**
 * 创建VLESS代理的认证选项
 * flow (XTLS Vision) 对 sing-box 和 xray 均支持
 */
function createVlessAuthOptions(s: LuCI.form.AbstractSection) {
    let flowOpt = s.option(form.ListValue, 'flow', _('VLESS Flow Control'),
        _('VLESS Flow Control'));
    flowOpt.modalonly = true;
    // sing-box 和 xray 均支持 flow: xtls-rprx-vision
    flowOpt.depends('type', PROXY_TYPE.VLESS);

    HijpassValues.VLESS_FLOWS.forEach((item) => {
        flowOpt.value(item.value, item.label);
    });
}

/**
 * 创建通用的XHTTP传输选项（Xray 核心专用，sing-box 不支持 xhttp transport）
 */
function createTransportXhttpOptions(s: LuCI.form.AbstractSection) {
    let hostOpt = s.option(form.Value, 'transport_xhttp_host', _('XHTTP Host'),
        _('XHTTP Host Domain'));
    hostOpt.modalonly = true;
    hostOpt.depends({ type: PROXY_TYPE.VLESS, core: 'xray', transport_type: 'xhttp' });

    let pathOpt = s.option(form.Value, 'transport_xhttp_path', _('XHTTP Path'),
        _('XHTTP Request Path'));
    pathOpt.modalonly = true;
    pathOpt.default = '/';
    pathOpt.depends({ type: PROXY_TYPE.VLESS, core: 'xray', transport_type: 'xhttp' });

    let modeOpt = s.option(form.ListValue, 'transport_xhttp_mode', _('XHTTP Mode'),
        _('XHTTP Transport Mode'));
    modeOpt.modalonly = true;
    modeOpt.default = 'auto';
    modeOpt.value('auto', _('自动'));
    modeOpt.value('stream-one', 'stream-one');
    modeOpt.value('stream-up', 'stream-up');
    modeOpt.depends({ type: PROXY_TYPE.VLESS, core: 'xray', transport_type: 'xhttp' });
}


/**
 * Adds depends('type', t) for each protocol — replaces repetitive per-line depends calls.
 */
function forProtocols(o: LuCI.form.AbstractValue, types: ProxyType[]): void {
    types.forEach(t => o.depends('type', t));
}

/**
 * Adds depends({type: t, core}) for each protocol — for core-specific fields.
 */
function forCoreProtocols(o: LuCI.form.AbstractValue, core: CoreType, types: ProxyType[]): void {
    types.forEach(t => o.depends({ type: t, core }));
}

/**
 * Filters the type <select> to only show options supported by the given core.
 * Resets to SHADOWSOCKS if the current value is not in the valid list.
 */
function applyFilter(typeSelect: HTMLSelectElement, core: string): void {
    // 自定义核心不参与协议过滤，type 字段由 depends 负责隐藏
    if (core === 'custom') return;
    const effectiveCore: CoreType = (core === 'xray') ? 'xray' : 'singbox';
    const valid = CORE_PROTOCOLS[effectiveCore] ?? [];
    Array.from(typeSelect.options).forEach(
        (o: HTMLOptionElement) => (o.hidden = !valid.includes(o.value as ProxyType))
    );
    if (!valid.includes(typeSelect.value as ProxyType)) {
        typeSelect.value = PROXY_TYPE.SHADOWSOCKS;
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

/**
 * Creates the core ListValue and a type ListValue whose <option> elements are
 * filtered to the selected core on every change. Replaces the old
 * createProxyTypeOption() + createHysteria2CoreOption() pair.
 */
function createCoreAndTypeOptions(s: LuCI.form.AbstractSection): void {
    // ── core field (always visible, always written) ──────────────────────
    let coreOpt = s.option(form.ListValue, 'core', _('Backend Core'),
        _('Select backend core for this proxy node'));
    coreOpt.modalonly = true;
    coreOpt.default = 'singbox';
    coreOpt.rmempty = false;
    HijpassValues.DUAL_CORES.forEach(c => coreOpt.value(c.value, _(c.label)));

    // ── type field（仅 xray/singbox 核心时显示）───────────────────────────
    let typeOpt = s.option(form.ListValue, 'type', _('Proxy Type'),
        _('Select Proxy Type'));
    typeOpt.modalonly = true;
    typeOpt.default = PROXY_TYPE.SHADOWSOCKS;
    typeOpt.rmempty = false;
    // core=custom 时通过 depends 隐藏整个 type 字段
    typeOpt.depends('core', 'xray');
    typeOpt.depends('core', 'singbox');
    HijpassValues.PROXY_TYPES.forEach(t => typeOpt.value(t.value, _(t.label)));

    // Override renderWidget to attach the core→type filter after DOM is ready.
    // coreOpt is captured by closure so both fields share the same section scope.
    typeOpt.renderWidget = function (section_id: string, option_index: number, cfgvalue: string): Node {
        const widget = form.ListValue.prototype.renderWidget.call(
            this, section_id, option_index, cfgvalue) as HTMLElement;
        const typeSelect = widget.querySelector('select') as HTMLSelectElement;

        // setTimeout(0) defers until the modal DOM is fully rendered.
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
}

/**
 * 创建所有代理配置选项
 */
function createProxyOptions(s: LuCI.form.AbstractSection, instances: any) {
    // Grid表格显示选项（所有类型都显示）
    createGridDisplayOptions(s, instances);

    // 通用选项（所有类型都需要）
    createNodeNameOption(s);
    createEnabledOption(s);
    createCoreAndTypeOptions(s);

    // 类型特定的选项 - 服务器地址和端口
    createCommonServerOptions(s);

    // 自定义代理选项
    createCustomProxyOptions(s);

    createUuidOption(s);
    createPasswordOption(s);

    // 通用TLS配置（供所有支持TLS的协议使用）
    createCommonTlsOptions(s);

    createNetworkOption(s);
    createHysteria2AdvancedOptions(s);
    createHysteria2XrayOptions(s);
    createHysteria2ObfsOptions(s);
    createHysteria2DebugOptions(s);

    // Shadowsocks代理选项
    createShadowsocksEncryptionOptions(s);
    createShadowsocksPluginOptions(s);
    createShadowsocksNetworkOptions(s);

    createTuicAdvancedOptions(s);

    // ShadowTLS代理选项
    createShadowTLSAuthOptions(s);

    // VLESS代理选项
    createVlessAuthOptions(s);
    createVlessNetworkOptions(s);

    // TLS Reality配置（供支持Reality的协议使用：VLESS等）
    createTlsRealityOptions(s);

    // 通用传输层配置（供支持Transport的协议使用：VLESS等）
    createTransportTypeOption(s);
    createTransportHttpOptions(s);
    createTransportWsOptions(s);
    createTransportGrpcOptions(s);
    createTransportHttpupgradeOptions(s);
    createTransportXhttpOptions(s);

    // 通用多路复用配置（供支持多路复用的协议使用：Shadowsocks、VLESS）
    createMultiplexOptions(s);
    // 通用的监听端口选项（所有代理类型都需要）
    createProxyPortOptions(s);
    createProxyEnvironmentOptions(s);
}





export default v;