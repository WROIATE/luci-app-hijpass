import view from "view";
import uci from "uci";
import {LuciFlied, HijpassValues, PROXY_TYPE} from "../enum/hijpass";
import form from "form";
import {LuciUtils, ShuntUtils, WebUtils} from "../utils/common";
import fs from "fs";

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME)
        ]);
    },

    handleSaveApply: LuciUtils.genHandleSaveApply(),
    handleSave: function (ev?: Event) {
        return view.prototype.handleSave.call(this, ev);
    },
    render: async function () {
        let m = new form.Map(LuciFlied.CONF_NAME, _('代理设置'),
            _('配置代理程序设置'));
        let s = m.section(form.GridSection, LuciFlied.PROXY_NODE_TYPE)
        WebUtils.setAnonymousGridSectionMembers(s);
        s.cloneable = true

        // 重写 handleAdd 方法，使用自定义的唯一 ID 生成器
        s.handleAdd = function (ev: Event, name?: string) {
            let sectionId = WebUtils.generateUniqueSectionId();
            return L.bind(form.GridSection.prototype.handleAdd, this, ev, sectionId)();
        }
        s.handleRemove = async function (ev: Event, name?: string) {
            form.GridSection.prototype.handleRemove.call(this, ev, name)
        }
        // 创建所有代理配置选项
        let data = await getPortStatus();
        createProxyOptions(s, data);

        return m.render();
    },
});

/**
 * 创建启用状态选项
 */
function createEnabledOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Flag, 'enabled', _('启用'), _(''));
    o.modalonly = true;
    o.default = '1';
    o.rmempty = false;
    return o;
}

/**
 * 创建节点名称编辑选项
 */
function createNodeNameOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Value, 'name', _('节点名称'),
        _('修改节点的名称，用于标识不同的代理节点'));
    o.modalonly = true;
    o.validate = WebUtils.createTagValidator(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, 'name')
    return o;
}

/**
 * 创建代理类型选择选项
 */
function createProxyTypeOption(s: LuCI.form.AbstractSection) {
    let o = s.option(form.ListValue, 'type', _('代理类型'),
        _('选择代理程序类型'));
    o.modalonly = true;
    o.default = PROXY_TYPE.SHADOWSOCKS;
    o.rmempty = false;

    HijpassValues.PROXY_TYPES.forEach((item) => {
        o.value(item.value, _(item.label));
    });

    return o;
}

/**
 * 创建Grid表格显示选项
 */
function createGridDisplayOptions(s: LuCI.form.AbstractSection, data: { [key: string]: boolean }) {
    let typeOpt = s.option(form.TextValue, 'type', _('类型'), _('代理类型'));
    typeOpt.modalonly = false;
    typeOpt.textvalue = function (section_id: string) {
        let type = uci.get(LuciFlied.CONF_NAME, section_id, 'type') || PROXY_TYPE.CUSTOM;
        let typeLabel = HijpassValues.PROXY_TYPES.find(t => t.value === type)?.label || type;
        return E('span', {}, _(typeLabel));
    };

    // 显示服务器信息（不同类型显示不同内容）
    let serverInfoOpt = s.option(form.TextValue, 'server_info', _('配置信息'), _(''));
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
                    return E('span', {title: command}, command.substring(0, 47) + '...');
                }
                return command || '';
            }
            case PROXY_TYPE.HYSTERIA2:
                return E('span', {}, server_name ? server_name + ':' + (server_port || '443') : _('未配置'));
            case PROXY_TYPE.SHADOWSOCKS: {
                let method = uci.get(LuciFlied.CONF_NAME, section_id, 'method');
                return E('span', {}, server_name ? server_name + ':' + (server_port || '-') + ' (' + (method || '-') + ')' : _('未配置'));
            }
            case PROXY_TYPE.TUIC: {
                let congestion = uci.get(LuciFlied.CONF_NAME, section_id, 'congestion_control');
                return E('span', {}, server_name ? server_name + ':' + (server_port || '-') + ' (' + (congestion || 'cubic') + ')' : _('未配置'));
            }
            case PROXY_TYPE.SHADOWTLS: {
                let version = uci.get(LuciFlied.CONF_NAME, section_id, 'version');
                return E('span', {}, server_name ? server_name + ':' + (server_port || '-') + ' (v' + (version || '1') + ')' : _('未配置'));
            }
            case PROXY_TYPE.VLESS: {
                let flow = uci.get(LuciFlied.CONF_NAME, section_id, 'flow');
                return E('span', {}, server_name ? server_name + ':' + (server_port || '-') + (flow ? ' (' + flow + ')' : '') : _('未配置'));
            }
            default:
                return '';
        }
    };

    // 显示监听端口和状态
    let listenPortOpt = s.option(form.TextValue, 'listen_port', _('监听端口'), _(''));
    listenPortOpt.modalonly = false;
    listenPortOpt.textvalue = function (section_id: string) {
        let port = uci.get(LuciFlied.CONF_NAME, section_id, 'listen_port');
        let portStatus = data[port] ? 'green' : 'red';
        return E('span', {style: 'color: ' + portStatus}, port || '-');
    };

    // 显示SOCKS端口和状态
    let socksPortOpt = s.option(form.TextValue, 'socks_port', _('SOCKS端口'), _(''));
    socksPortOpt.modalonly = false;
    socksPortOpt.textvalue = function (section_id: string) {
        let port = uci.get(LuciFlied.CONF_NAME, section_id, 'socks_port');
        let portStatus = data[port] ? 'green' : 'red';
        return E('span', {style: 'color: ' + portStatus}, port || '-');
    };

    // 启用状态（在表格中显示并可直接修改）
    let enabledOpt = createEnabledOption(s);
    enabledOpt.editable = true;
    enabledOpt.modalonly = false;
}

/**
 * 创建自定义代理的特定选项
 */
function createCustomProxyOptions(s: LuCI.form.AbstractSection) {
    // 运行命令
    let o = s.option(form.Value, 'command', _('运行命令'),
        _('指定代理程序运行命令'));
    o.default = '/usr/bin/xray -c /etc/hijpass/proxy.json';
    o.rmempty = false;
    o.modalonly = true;
    o.depends('type', PROXY_TYPE.CUSTOM);
    return o;
}

/**
 * 创建代理监听端口选项（所有代理类型通用）
 */
function createProxyPortOptions(s: LuCI.form.AbstractSection) {
    let listenPortOpt = s.option(form.Value, 'listen_port', _('本地监听端口'),
        _('指定本地透明代理监听端口号'));
    listenPortOpt.datatype = 'port';
    listenPortOpt.rmempty = false;
    listenPortOpt.modalonly = true;
    listenPortOpt.validate = function (sectionId: string, value: string) {
        let socks_port = uci.get(LuciFlied.CONF_NAME, sectionId, "socks_port");
        if (socks_port === value) {
            return _("与socks端口冲突")
        }
        return WebUtils.validatePortConflict.call(this, sectionId, value);
    }
    listenPortOpt.load = function (section_id: string) {
        let value = form.Value.prototype.load.call(this, section_id);
        if (value) {
            return value;
        }
        let port = findAvailablePort(7890)
        form.Value.prototype.write.call(this, section_id, port);
        return port.toString();
    };

    let socksPortOpt = s.option(form.Value, 'socks_port', _('本地SOCKS监听端口'),
        _('指定本地SOCKS监听端口号'));
    socksPortOpt.datatype = 'port';
    socksPortOpt.rmempty = false;
    socksPortOpt.modalonly = true;
    socksPortOpt.validate = function (sectionId: string, value: string) {
        let listen_port = uci.get(LuciFlied.CONF_NAME, sectionId, "listen_port");
        if (listen_port === value) {
            return _("与透明代理端口冲突")
        }
        return WebUtils.validatePortConflict.call(this, sectionId, value);
    }
    socksPortOpt.load = function (section_id: string) {
        let value = form.Value.prototype.load.call(this, section_id);
        if (value) {
            return value;
        }
        let port = findAvailablePort(7891)
        form.Value.prototype.write.call(this, section_id, port);
        return port.toString();
    };
}

/**
 * 创建自定义代理的环境变量和日志选项
 */
function createProxyEnvironmentOptions(s: LuCI.form.AbstractSection) {
    let procdEnvOpt = s.option(form.DynamicList, 'procd_env', _('procd环境变量'),
        _('指定procd服务的环境变量，例如：SOME_VARIABLE=funtimes'));
    procdEnvOpt.modalonly = true;

    WebUtils.createLogFlagOption(s, LuciFlied.CONF_NAME, undefined)
}


/**
 * 创建通用的服务器地址和端口选项（用于所有需要server/server_port的协议）
 */
function createCommonServerOptions(s: LuCI.form.AbstractSection) {
    let serverAddrOpt = s.option(form.Value, 'server', _('服务器地址'),
        _('代理服务器地址'));
    serverAddrOpt.modalonly = true;
    serverAddrOpt.rmempty = false;
    serverAddrOpt.depends('type', PROXY_TYPE.HYSTERIA2);
    serverAddrOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);
    serverAddrOpt.depends('type', PROXY_TYPE.TUIC);
    serverAddrOpt.depends('type', PROXY_TYPE.SHADOWTLS);
    serverAddrOpt.depends('type', PROXY_TYPE.VLESS);

    let serverPortOpt = s.option(form.Value, 'server_port', _('服务器端口'),
        _('代理服务器端口'));
    serverPortOpt.datatype = 'port';
    serverPortOpt.modalonly = true;
    serverPortOpt.rmempty = false;
    serverPortOpt.depends('type', PROXY_TYPE.HYSTERIA2);
    serverPortOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);
    serverPortOpt.depends('type', PROXY_TYPE.TUIC);
    serverPortOpt.depends('type', PROXY_TYPE.SHADOWTLS);
    serverPortOpt.depends('type', PROXY_TYPE.VLESS);
}

/**
 * 创建Hysteria2代理的高级选项
 */
function createHysteria2AdvancedOptions(s: LuCI.form.AbstractSection) {
    let serverPortsOpt = s.option(form.DynamicList, 'server_ports', _('端口跳跃'),
        _('端口跳跃范围列表，如 2080-3000'));
    serverPortsOpt.modalonly = true;
    serverPortsOpt.datatype = 'portrange';
    serverPortsOpt.depends('type', PROXY_TYPE.HYSTERIA2);

    let hopIntervalOpt = s.option(form.Value, 'hop_interval', _('端口跳跃间隔'),
        _('端口跳跃间隔，如90s'));
    hopIntervalOpt.modalonly = true;
    // hop_interval 依赖于类型是 Hysteria2 且 server_ports 有值
    hopIntervalOpt.depends({type: PROXY_TYPE.HYSTERIA2, server_ports: /./});

    let upMbpsOpt = s.option(form.Value, 'up_mbps', _('上行速率'),
        _('上行最大带宽（Mbps）'));
    upMbpsOpt.datatype = 'uinteger';
    upMbpsOpt.modalonly = true;
    upMbpsOpt.depends('type', PROXY_TYPE.HYSTERIA2);

    let downMbpsOpt = s.option(form.Value, 'down_mbps', _('下行速率'),
        _('下行最大带宽（Mbps）'));
    downMbpsOpt.datatype = 'uinteger';
    downMbpsOpt.modalonly = true;
    downMbpsOpt.depends('type', PROXY_TYPE.HYSTERIA2);
}

/**
 * 创建Hysteria2代理的OBFS选项
 */
function createHysteria2ObfsOptions(s: LuCI.form.AbstractSection) {
    let obfsTypeOpt = s.option(form.ListValue, 'obfs_type', _('OBFS类型'),
        _('QUIC流量混淆器类型，仅支持 salamander'));
    obfsTypeOpt.modalonly = true;
    obfsTypeOpt.depends('type', PROXY_TYPE.HYSTERIA2);

    HijpassValues.HYSTERIA2_OBFS_TYPES.forEach((item) => {
        obfsTypeOpt.value(item.value, _(item.label));
    });

    let obfsPasswordOpt = s.option(form.Value, 'obfs_password', _('OBFS密码'),
        _('QUIC流量混淆器密码（obfs_type设置为salamander时需要）'));
    obfsPasswordOpt.modalonly = true;
    obfsPasswordOpt.depends('obfs_type', 'salamander');
}

/**
 * 创建VLESS代理的网络和packet_encoding选项
 */
function createVlessNetworkOptions(s: LuCI.form.AbstractSection) {
    let packetEncodingOpt = s.option(form.ListValue, 'packet_encoding', _('UDP包编码'),
        _('UDP包编码方式'));
    packetEncodingOpt.modalonly = true;
    packetEncodingOpt.depends('type', PROXY_TYPE.VLESS);

    HijpassValues.VLESS_PACKET_ENCODINGS.forEach((item) => {
        packetEncodingOpt.value(item.value, item.label);
    });
}

/**
 * 创建通用传输层类型选择（用于支持Transport的协议：VLESS等）
 */
function createTransportTypeOption(s: LuCI.form.AbstractSection) {
    let transportOpt = s.option(form.ListValue, 'transport_type', _('传输协议'),
        _('V2Ray传输层协议'));
    transportOpt.modalonly = true;
    transportOpt.depends('type', PROXY_TYPE.VLESS);

    HijpassValues.V2RAY_TRANSPORT_TYPES.forEach((item) => {
        transportOpt.value(item.value, item.label);
    });
}

/**
 * 创建通用的HTTP传输选项（用于支持Transport的协议：VLESS等）
 */
function createTransportHttpOptions(s: LuCI.form.AbstractSection) {
    let hostOpt = s.option(form.Value, 'transport_http_host', _('HTTP主机'),
        _('HTTP请求的主机域名列表'));
    hostOpt.modalonly = true;
    hostOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'http'});

    let pathOpt = s.option(form.Value, 'transport_http_path', _('HTTP路径'),
        _('HTTP请求路径'));
    pathOpt.modalonly = true;
    pathOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'http'});

    let methodOpt = s.option(form.Value, 'transport_http_method', _('HTTP方法'),
        _('HTTP请求方法'));
    methodOpt.modalonly = true;
    methodOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'http'});

    let idleOpt = s.option(form.Value, 'transport_http_idle_timeout', _('空闲超时'),
        _('闲置连接超时（如15s）'));
    idleOpt.modalonly = true;
    idleOpt.default = '15s';
    idleOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'http'});

    let pingOpt = s.option(form.Value, 'transport_http_ping_timeout', _('PING超时'),
        _('PING响应超时（如15s）'));
    pingOpt.modalonly = true;
    pingOpt.default = '15s';
    pingOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'http'});
}

/**
 * 创建通用的WebSocket传输选项（用于支持Transport的协议：VLESS等）
 */
function createTransportWsOptions(s: LuCI.form.AbstractSection) {
    let pathOpt = s.option(form.Value, 'transport_ws_path', _('WebSocket路径'),
        _('HTTP请求路径'));
    pathOpt.modalonly = true;
    pathOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'ws'});

    let earlyDataOpt = s.option(form.Value, 'transport_ws_max_early_data', _('最大早期数据'),
        _('请求中允许的最大有效负载大小'));
    earlyDataOpt.datatype = 'uinteger';
    earlyDataOpt.modalonly = true;
    earlyDataOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'ws'});

    let headerNameOpt = s.option(form.Value, 'transport_ws_early_data_header_name', _('早期数据头名'),
        _('早期数据头名称（如Sec-WebSocket-Protocol）'));
    headerNameOpt.modalonly = true;
    headerNameOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'ws'});
}

/**
 * 创建通用的gRPC传输选项（用于支持Transport的协议：VLESS等）
 */
function createTransportGrpcOptions(s: LuCI.form.AbstractSection) {
    let serviceOpt = s.option(form.Value, 'transport_grpc_service_name', _('gRPC服务名'),
        _('gRPC服务名称'));
    serviceOpt.modalonly = true;
    serviceOpt.default = 'TunService';
    serviceOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'grpc'});

    let idleOpt = s.option(form.Value, 'transport_grpc_idle_timeout', _('空闲超时'),
        _('空闲超时时间（如15s）'));
    idleOpt.modalonly = true;
    idleOpt.default = '15s';
    idleOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'grpc'});

    let pingOpt = s.option(form.Value, 'transport_grpc_ping_timeout', _('PING超时'),
        _('PING响应超时（如15s）'));
    pingOpt.modalonly = true;
    pingOpt.default = '15s';
    pingOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'grpc'});

    let permitOpt = s.option(form.Flag, 'transport_grpc_permit_without_stream', _('无流允许'),
        _('在没有活动连接时是否发送keepalive ping'));
    permitOpt.modalonly = true;
    permitOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'grpc'});
}

/**
 * 创建通用的HTTPUpgrade传输选项（用于支持Transport的协议：VLESS等）
 */
function createTransportHttpupgradeOptions(s: LuCI.form.AbstractSection) {
    let hostOpt = s.option(form.Value, 'transport_httpupgrade_host', _('HTTPUpgrade主机'),
        _('主机域名'));
    hostOpt.modalonly = true;
    hostOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'httpupgrade'});

    let pathOpt = s.option(form.Value, 'transport_httpupgrade_path', _('HTTPUpgrade路径'),
        _('HTTP请求路径'));
    pathOpt.modalonly = true;
    pathOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'httpupgrade'});
}

/**
 * 创建通用TLS配置选项（用于支持TLS的协议：Hysteria2、TUIC、ShadowTLS、VLESS）
 */
function createCommonTlsOptions(s: LuCI.form.AbstractSection) {
    let serverNameOpt = s.option(form.Value, 'tls_server_name', _('TLS服务器名称'),
        _('TLS握手时使用的服务器名称'));
    serverNameOpt.modalonly = true;
    serverNameOpt.rmempty = false;
    serverNameOpt.depends('type', PROXY_TYPE.HYSTERIA2);
    serverNameOpt.depends('type', PROXY_TYPE.TUIC);
    serverNameOpt.depends('type', PROXY_TYPE.SHADOWTLS);
    serverNameOpt.depends('type', PROXY_TYPE.VLESS);

    let insecureOpt = s.option(form.Flag, 'tls_insecure', _('忽略证书验证'),
        _('接受任何服务器证书（不安全）'));
    insecureOpt.modalonly = true;
    insecureOpt.depends('type', PROXY_TYPE.HYSTERIA2);
    insecureOpt.depends('type', PROXY_TYPE.TUIC);
    insecureOpt.depends('type', PROXY_TYPE.SHADOWTLS);
    insecureOpt.depends('type', PROXY_TYPE.VLESS);
}

/**
 * 创建TLS Reality配置选项（用于支持Reality的协议：VLESS等）
 */
function createTlsRealityOptions(s: LuCI.form.AbstractSection) {
    let realityEnabledOpt = s.option(form.Flag, 'tls_reality_enabled', _('启用TLS Reality'),
        _('启用TLS Reality分流伪装'));
    realityEnabledOpt.modalonly = true;
    realityEnabledOpt.depends('type', PROXY_TYPE.VLESS);

    let publicKeyOpt = s.option(form.Value, 'tls_reality_public_key', _('Reality公钥'),
        _('服务器的Reality公钥'));
    publicKeyOpt.modalonly = true;
    publicKeyOpt.depends({type: PROXY_TYPE.VLESS, tls_reality_enabled: '1'});

    let shortIdOpt = s.option(form.Value, 'tls_reality_short_id', _('Reality短ID'),
        _('服务器的Reality短ID'));
    shortIdOpt.modalonly = true;
    shortIdOpt.depends({type: PROXY_TYPE.VLESS, tls_reality_enabled: '1'});
}

/**
 * 创建Hysteria2代理的调试选项
 */
function createHysteria2DebugOptions(s: LuCI.form.AbstractSection) {
    let o = s.option(form.Flag, 'brutal_debug', _('启用Brutal CC调试'),
        _('启用Hysteria Brutal CC的调试日志'));
    o.modalonly = true;
    o.depends('type', PROXY_TYPE.HYSTERIA2);
}

function createNetworkOption(s: LuCI.form.AbstractSection) {
    let networkOpt = s.option(form.ListValue, 'network', _('网络协议'),
        _('启用的网络协议，默认所有'));
    networkOpt.modalonly = true;
    networkOpt.default = '';
    networkOpt.value('', '默认');
    networkOpt.value('tcp', 'TCP');
    networkOpt.value('udp', 'UDP');

    networkOpt.depends('type', PROXY_TYPE.HYSTERIA2);
    networkOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);
    networkOpt.depends('type', PROXY_TYPE.TUIC);
    networkOpt.depends('type', PROXY_TYPE.VLESS);
}

function createPasswordOption(s: LuCI.form.AbstractSection) {
    let passwordOpt = s.option(form.Value, 'password', _('密码'),
        _('认证密码'));
    passwordOpt.modalonly = true;
    passwordOpt.password = true;
    passwordOpt.rmempty = false;
    passwordOpt.depends('type', PROXY_TYPE.HYSTERIA2);
    passwordOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);
    passwordOpt.depends('type', PROXY_TYPE.TUIC);
    // password 仅在 v2 或 v3 时显示
    passwordOpt.depends({type: PROXY_TYPE.SHADOWTLS, version: '2'});
    passwordOpt.depends({type: PROXY_TYPE.SHADOWTLS, version: '3'});
}

function createUuidOption(s: LuCI.form.AbstractSection) {
    let uuidOpt = s.option(form.Value, 'uuid', _('UUID'), _('用户 UUID'));
    uuidOpt.modalonly = true;
    uuidOpt.rmempty = false;
    uuidOpt.depends('type', PROXY_TYPE.VLESS);
    uuidOpt.depends('type', PROXY_TYPE.TUIC);
}

function createMultiplexOptions(s: LuCI.form.AbstractSection) {
    let enabledOpt = s.option(form.Flag, 'multiplex_enabled', _('启用多路复用'),
        _('启用多路复用以提高连接效率'));
    enabledOpt.modalonly = true;
    enabledOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);
    enabledOpt.depends('type', PROXY_TYPE.VLESS);

    let protocolOpt = s.option(form.ListValue, 'multiplex_protocol', _('多路复用协议'),
        _('多路复用协议'));
    protocolOpt.modalonly = true;
    protocolOpt.default = 'h2mux';
    protocolOpt.depends({type: PROXY_TYPE.SHADOWSOCKS, multiplex_enabled: '1'});
    protocolOpt.depends({type: PROXY_TYPE.VLESS, multiplex_enabled: '1'});

    HijpassValues.MULTIPLEX_PROTOCOLS.forEach((item) => {
        protocolOpt.value(item.value, item.label);
    });

    let maxConnOpt = s.option(form.Value, 'multiplex_max_connections', _('最大连接数'),
        _('最大连接数量'));
    maxConnOpt.datatype = 'uinteger';
    maxConnOpt.modalonly = true;
    maxConnOpt.depends({type: PROXY_TYPE.SHADOWSOCKS, multiplex_enabled: '1'});
    maxConnOpt.depends({type: PROXY_TYPE.VLESS, multiplex_enabled: '1'});

    let minStreamsOpt = s.option(form.Value, 'multiplex_min_streams', _('最小流数'),
        _('在打开新连接前的最小流数量'));
    minStreamsOpt.datatype = 'uinteger';
    minStreamsOpt.modalonly = true;
    minStreamsOpt.depends({type: PROXY_TYPE.SHADOWSOCKS, multiplex_enabled: '1'});
    minStreamsOpt.depends({type: PROXY_TYPE.VLESS, multiplex_enabled: '1'});

    let maxStreamsOpt = s.option(form.Value, 'multiplex_max_streams', _('最大流数'),
        _('在打开新连接前的最大流数量'));
    maxStreamsOpt.datatype = 'uinteger';
    maxStreamsOpt.modalonly = true;
    maxStreamsOpt.depends({type: PROXY_TYPE.SHADOWSOCKS, multiplex_enabled: '1'});
    maxStreamsOpt.depends({type: PROXY_TYPE.VLESS, multiplex_enabled: '1'});

    // TCP Brutal 拥塞控制算法
    let brutalEnabledOpt = s.option(form.Flag, 'multiplex_brutal_enabled', _('启用TCP Brutal'),
        _('启用TCP Brutal拥塞控制算法'));
    brutalEnabledOpt.modalonly = true;
    brutalEnabledOpt.depends({type: PROXY_TYPE.SHADOWSOCKS, multiplex_enabled: '1'});
    brutalEnabledOpt.depends({type: PROXY_TYPE.VLESS, multiplex_enabled: '1'});

    let brutalUpOpt = s.option(form.Value, 'multiplex_brutal_up_mbps', _('上行带宽'),
        _('上行带宽（Mbps）'));
    brutalUpOpt.datatype = 'uinteger';
    brutalUpOpt.modalonly = true;
    brutalUpOpt.depends({type: PROXY_TYPE.SHADOWSOCKS, multiplex_enabled: '1', multiplex_brutal_enabled: '1'});
    brutalUpOpt.depends({type: PROXY_TYPE.VLESS, multiplex_enabled: '1', multiplex_brutal_enabled: '1'});

    let brutalDownOpt = s.option(form.Value, 'multiplex_brutal_down_mbps', _('下行带宽'),
        _('下行带宽（Mbps）'));
    brutalDownOpt.datatype = 'uinteger';
    brutalDownOpt.modalonly = true;
    brutalDownOpt.depends({type: PROXY_TYPE.SHADOWSOCKS, multiplex_enabled: '1', multiplex_brutal_enabled: '1'});
    brutalDownOpt.depends({type: PROXY_TYPE.VLESS, multiplex_enabled: '1', multiplex_brutal_enabled: '1'});
}

/**
 * 创建Shadowsocks代理的加密和密码选项
 */
function createShadowsocksEncryptionOptions(s: LuCI.form.AbstractSection) {
    let methodOpt = s.option(form.ListValue, 'method', _('加密方法'),
        _('Shadowsocks加密方法'));
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
    let pluginOpt = s.option(form.ListValue, 'plugin', _('插件'),
        _('Shadowsocks SIP003插件'));
    pluginOpt.modalonly = true;
    pluginOpt.value('', _('无'));
    pluginOpt.value('obfs-local', 'obfs-local');
    pluginOpt.value('v2ray-plugin', 'v2ray-plugin');
    pluginOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);

    let pluginOptsOpt = s.option(form.Value, 'plugin_opts', _('插件选项'),
        _('Shadowsocks SIP003插件参数'));
    pluginOptsOpt.modalonly = true;
    // plugin_opts 依赖于类型是 Shadowsocks 且 plugin 有值
    pluginOptsOpt.depends({type: PROXY_TYPE.SHADOWSOCKS, plugin: /./});
}

/**
 * 创建Shadowsocks代理的网络选项
 */
function createShadowsocksNetworkOptions(s: LuCI.form.AbstractSection) {
    let udpOverTcpOpt = s.option(form.Flag, 'udp_over_tcp', _('UDP over TCP'),
        _('启用UDP over TCP'));
    udpOverTcpOpt.modalonly = true;
    udpOverTcpOpt.depends('type', PROXY_TYPE.SHADOWSOCKS);
}

/**
 * 创建TUIC代理的高级选项
 */
function createTuicAdvancedOptions(s: LuCI.form.AbstractSection) {
    let congestionOpt = s.option(form.ListValue, 'congestion_control', _('拥塞控制'),
        _('QUIC拥塞控制算法'));
    congestionOpt.modalonly = true;
    congestionOpt.default = 'cubic';
    congestionOpt.depends('type', PROXY_TYPE.TUIC);

    HijpassValues.TUIC_CONGESTION_CONTROLS.forEach((item) => {
        congestionOpt.value(item.value, item.label);
    });

    let udpRelayOpt = s.option(form.ListValue, 'udp_relay_mode', _('UDP中继模式'),
        _('UDP包中继模式'));
    udpRelayOpt.modalonly = true;
    udpRelayOpt.default = '';
    // udp_relay_mode 依赖于 udp_over_stream 未启用
    udpRelayOpt.depends({type: PROXY_TYPE.TUIC, udp_over_stream: '0'});

    udpRelayOpt.value('', _('无'));
    HijpassValues.TUIC_UDP_RELAY_MODES.forEach((item) => {
        udpRelayOpt.value(item.value, item.label);
    });

    let udpOverStreamOpt = s.option(form.Flag, 'udp_over_stream', _('UDP over Stream'),
        _('使用流式UDP中继'));
    udpOverStreamOpt.modalonly = true;
    udpOverStreamOpt.depends('type', PROXY_TYPE.TUIC);

    let zero_rttOpt = s.option(form.Flag, 'zero_rtt_handshake', _('0-RTT握手'),
        _('启用0-RTT QUIC连接握手（不推荐，容易受到重放攻击）'));
    zero_rttOpt.modalonly = true;
    zero_rttOpt.depends('type', PROXY_TYPE.TUIC);

    let heartbeatOpt = s.option(form.Value, 'heartbeat', _('心跳间隔'),
        _('心跳包间隔，如10s'));
    heartbeatOpt.modalonly = true;
    heartbeatOpt.default = '10s';
    heartbeatOpt.depends('type', PROXY_TYPE.TUIC);
}

/**
 * 创建ShadowTLS代理的版本和密码选项
 */
function createShadowTLSAuthOptions(s: LuCI.form.AbstractSection) {
    let versionOpt = s.option(form.ListValue, 'version', _('协议版本'),
        _('ShadowTLS协议版本'));
    versionOpt.modalonly = true;
    versionOpt.default = '1';
    versionOpt.depends('type', PROXY_TYPE.SHADOWTLS);

    HijpassValues.SHADOWTLS_VERSIONS.forEach((item) => {
        versionOpt.value(item.value, item.label);
    });
}

/**
 * 创建VLESS代理的认证选项
 */
function createVlessAuthOptions(s: LuCI.form.AbstractSection) {
    let flowOpt = s.option(form.ListValue, 'flow', _('VLESS流控'),
        _('VLESS流量控制协议'));
    flowOpt.modalonly = true;
    flowOpt.depends('type', PROXY_TYPE.VLESS);

    HijpassValues.VLESS_FLOWS.forEach((item) => {
        flowOpt.value(item.value, item.label);
    });
}

/**
 * 创建通用的XHTTP传输选项（用于支持Transport的协议：VLESS等）
 */
function createTransportXhttpOptions(s: LuCI.form.AbstractSection) {
    let hostOpt = s.option(form.Value, 'transport_xhttp_host', _('XHTTP主机'),
        _('XHTTP请求的主机域名'));
    hostOpt.modalonly = true;
    hostOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'xhttp'});

    let pathOpt = s.option(form.Value, 'transport_xhttp_path', _('XHTTP路径'),
        _('XHTTP请求路径'));
    pathOpt.modalonly = true;
    pathOpt.default = '/';
    pathOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'xhttp'});

    let modeOpt = s.option(form.ListValue, 'transport_xhttp_mode', _('XHTTP模式'),
        _('XHTTP传输模式'));
    modeOpt.modalonly = true;
    modeOpt.default = 'auto';
    modeOpt.value('auto', _('自动'));
    modeOpt.value('stream-one', 'stream-one');
    modeOpt.value('stream-up', 'stream-up');
    modeOpt.depends({type: PROXY_TYPE.VLESS, transport_type: 'xhttp'});
}


/**
 * 创建所有代理配置选项
 */
function createProxyOptions(s: LuCI.form.AbstractSection, data: { [key: string]: boolean }) {
    // Grid表格显示选项（所有类型都显示）
    createGridDisplayOptions(s, data);

    // 通用选项（所有类型都需要）
    createNodeNameOption(s);
    createEnabledOption(s);
    createProxyTypeOption(s);

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

async function getPortStatus() {
    let portList = []
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section) => {
        if (section.listen_port) portList.push(section.listen_port);
        if (section.socks_port) portList.push(section.socks_port);
    });
    try {
        return await L.resolveDefault(fs.exec_direct(`/usr/lib/hijpass/net.sh`, ['port'].concat(portList), "json"), {});
    } catch (error) {
        console.log('Error:', error);
    }
}

/**
 * 查找第一个可用的端口（从起始端口开始）
 */
function findAvailablePort(startPort: number): number {
    let usedPorts = WebUtils.getUsedPorts();
    let port = startPort;

    // 最多尝试 1000 个端口，防止无限循环
    for (let i = 0; i < 1000; i++) {
        if (!usedPorts.includes(port)) {
            return port;
        }
        port++;
    }

    // 如果找不到可用端口，返回起始端口
    return startPort;
}

export default v;