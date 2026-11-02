/** @typedef {import('../types/server.uc').ServerOptions} ServerOptions */
/** @typedef {import('../types/core.uc').CoreConfig} CoreConfig */

/**
 * 将已校验的服务端选项组装成 sing-box 配置；不读写文件。
 * @param {ServerOptions} node
 * @returns {CoreConfig}
 */
export function build(node) {
    let inbound = { type: node.type, tag: 'server', listen: node.listen, listen_port: node.listen_port };
    if (node.type == 'shadowsocks') {
        inbound.method = node.method;
        inbound.password = node.password;
    }
    else if (node.type == 'hysteria2') {
        inbound.users = [{ name: node.name, password: node.password }];
        if (node.obfs_password) inbound.obfs = { type: 'salamander', password: node.obfs_password };
        if (node.up_mbps) inbound.up_mbps = node.up_mbps;
        if (node.down_mbps) inbound.down_mbps = node.down_mbps;
    }
    else {
        inbound.users = [{ name: node.name, uuid: node.uuid, flow: node.flow }];
        if (node.transport == 'ws') inbound.transport = { type: 'ws', path: node.ws_path };
        if (node.transport == 'grpc') inbound.transport = { type: 'grpc', service_name: node.grpc_service_name };
    }
    if (node.security != 'none') {
        inbound.tls = { enabled: true, server_name: node.server_name };
        if (node.security == 'tls') {
            inbound.tls.certificate_path = node.certificate_path;
            inbound.tls.key_path = node.key_path;
        }
        else {
            inbound.tls.reality = { enabled: true,
                handshake: { server: node.reality_server, server_port: node.reality_port },
                private_key: node.reality_private_key, short_id: [node.reality_short_id] };
        }
    }
    return { log: { level: node.log_level, timestamp: true }, inbounds: [inbound],
        outbounds: [{ type: 'direct', tag: 'direct' }] };
};
