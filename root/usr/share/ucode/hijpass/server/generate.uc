/** @typedef {import('../types/sections.uc').UciSection} UciSection */
/** @typedef {import('../types/server-sections.uc').ServerNodeSection} ServerNodeSection */
/** @typedef {import('../types/server.uc').ServerOptions} ServerOptions */
/** @typedef {import('../types/core.uc').CoreConfig} CoreConfig */
/** @typedef {import('../types/service.uc').ConfigFile} ConfigFile */
import { decode, port } from '../config/values.uc';
import { validateSections, findHijserverSection, filterServerNodeSections } from '../config/sections.uc';
import { nodeConfig } from '../config/paths.uc';
import { build as singbox } from './singbox.uc';
import { build as xray } from './xray.uc';

const methods = ['aes-128-gcm', 'aes-256-gcm', 'chacha20-ietf-poly1305',
    '2022-blake3-aes-128-gcm', '2022-blake3-aes-256-gcm', '2022-blake3-chacha20-poly1305'];

/**
 * 转换当前协议的字段并校验必填项，不读取其他协议的残留选项。
 * @param {ServerNodeSection} section
 * @returns {ServerOptions}
 */
export function options(section) {
    let node = decode(section, { type: ['text', ''], core: ['text', 'sing-box'],
        name: ['text', section['.name']], listen: ['text', '::'], listen_port: ['port', 0],
        log_level: ['text', 'info'] });
    if (index(['shadowsocks', 'hysteria2', 'vless'], node.type) < 0)
        die('select a server protocol; custom commands and JSON are no longer supported');
    if (index(['sing-box', 'xray'], node.core) < 0) die('unsupported server core');
    if (!iptoarr(node.listen)) die('listen must be an IPv4 or IPv6 address');
    if (!node.listen_port) die('listen_port is required');
    if (index(['debug', 'info', 'warn', 'error'], node.log_level) < 0) die('invalid log_level');
    nodeConfig(section, true);
    node.security = 'none';
    node.transport = 'tcp';
    if (node.type == 'shadowsocks' || node.type == 'hysteria2') {
        node.password = decode(section, { password: ['text', ''] }).password;
        if (!node.password) die('password is required');
    }
    if (node.type == 'shadowsocks') {
        node.method = decode(section, { method: ['text', ''] }).method;
        if (index(methods, node.method) < 0) die('unsupported Shadowsocks method');
        if (substr(node.method, 0, 5) == '2022-') {
            let bytes = node.method == '2022-blake3-aes-128-gcm' ? 16 : 32;
            let key = b64dec(node.password);
            if (key == null || length(key) != bytes || b64enc(key) != node.password)
                die(`Shadowsocks 2022 password must be a base64-encoded ${bytes}-byte key`);
        }
    }
    if (node.type == 'hysteria2') {
        node.security = 'tls';
        if (node.core == 'sing-box') {
            node = { ...node, ...decode(section, { obfs_password: ['text', ''],
                up_mbps: ['integer', 0, 1000000], down_mbps: ['integer', 0, 1000000] }) };
        }
    }
    if (node.type == 'vless') {
        node = { ...node, ...decode(section, { uuid: ['text', ''], flow: ['text', ''],
            transport: ['text', 'tcp'], security: ['text', 'tls'] }) };
        if (!match(node.uuid, /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/))
            die('invalid VLESS UUID');
        if (index(['tcp', 'ws', 'grpc'], node.transport) < 0) die('unsupported VLESS transport');
        if (index(['none', 'tls', 'reality'], node.security) < 0) die('unsupported VLESS security');
        if (node.flow != '' && node.flow != 'xtls-rprx-vision') die('unsupported VLESS flow');
        if (node.flow && (node.transport != 'tcp' || node.security == 'none'))
            die('Vision requires TCP with TLS or REALITY');
        if (node.security == 'reality' && node.transport != 'tcp') die('REALITY requires TCP');
        if (node.transport == 'ws') {
            node.ws_path = decode(section, { ws_path: ['text', '/'] }).ws_path;
            if (substr(node.ws_path, 0, 1) != '/') die('WebSocket path must start with /');
        }
        if (node.transport == 'grpc') {
            node.grpc_service_name = decode(section, { grpc_service_name: ['text', ''] }).grpc_service_name;
            if (!node.grpc_service_name) die('gRPC service name is required');
        }
    }
    if (node.security != 'none') {
        node.server_name = decode(section, { server_name: ['text', ''] }).server_name;
        if (node.security == 'tls') {
            node = { ...node, ...decode(section, { certificate_path: ['text', ''], key_path: ['text', ''] }) };
            for (let key in ['certificate_path', 'key_path']) {
                if (substr(node[key], 0, 1) != '/' || match(node[key], /[\r\n]/)) die(`${key} must be an absolute file path`);
            }
        }
        else {
            node = { ...node, ...decode(section, { reality_server: ['text', ''], reality_port: ['port', 443],
                reality_private_key: ['text', ''], reality_short_id: ['text', ''] }) };
            if (!node.server_name || !node.reality_server || !node.reality_port) die('REALITY server name and handshake target are required');
            if (!match(node.reality_private_key, /^[A-Za-z0-9_-]{43}$/)) die('invalid REALITY private key');
            if (!match(node.reality_short_id, /^([0-9a-fA-F]{2}){0,8}$/)) die('invalid REALITY short ID');
        }
    }
    return node;
};

/** @param {ServerNodeSection} section @returns {CoreConfig} */
export function render(section) {
    try {
        let node = options(section);
        return node.core == 'xray' ? xray(node) : singbox(node);
    }
    catch (e) { die(`server "${section.name || section['.name']}": ${e.message}`); }
};

/**
 * 生成启用节点的文件内容；只处理数据，写文件和启动由服务层完成。
 * @param {UciSection[]} sections
 * @returns {ConfigFile[]}
 */
export function generate(sections) {
    validateSections(sections);
    let global = findHijserverSection(sections);
    if (!global) die('missing hijserver global section');
    if (global.enabled != '1') return [];
    let files = [], ports = {};
    for (let section in filterServerNodeSections(sections)) {
        if (section.enabled != '1') continue;
        let config = render(section), number = port(section.listen_port);
        if (ports[number]) die(`server "${section.name || section['.name']}": duplicate listen port ${number}`);
        ports[number] = true;
        push(files, { path: nodeConfig(section, true), data: sprintf('%.2J\n', config) });
    }
    return files;
};
